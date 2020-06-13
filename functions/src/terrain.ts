import {
    ENetworkObjectType,
    IApiPersonsResourceHarvestPost,
    IObject,
    IResource,
    ITerrainTilePosition,
    IVoronoi
} from "persons-game-common/lib/types/GameTypes";
import * as shajs from "sha.js";
import * as seedrandom from "seedrandom";
import * as delaunay from "d3-delaunay";
import {INetworkObjectDatabase, IPersonDatabase, IResourceDatabase} from "./types/database";
import admin from "firebase-admin";
import {PubSub} from "@google-cloud/pubsub";
import {getNetworkObjectCellString} from "./cell";
import express from "express";
import {HarvestResourceController} from "persons-game-common/lib/resources";
import {createResource} from "persons-game-common/lib/terrain";
import {resourceClientToDatabase} from "./common";

/**
 * Convert terrain tile to an id.
 * @param terrainTile
 */
const terrainTileToId = (terrainTile: ITerrainTilePosition): string => `terrainTile(${terrainTile.tileX},${terrainTile.tileY})`;

/**
 * Compute the voronoi diagram for a set of points.
 * @param points The input points.
 * @param bounds The bounds of the voronoi map.
 */
const computeVoronoi = (points: IObject[], bounds: delaunay.Delaunay.Bounds): IVoronoi[] => {
    const diagram = delaunay.Delaunay.from(points.map((p: IObject): delaunay.Delaunay.Point => {
        return [p.x, p.y];
    })).voronoi(bounds);

    return [...diagram.cellPolygons()].map((cell, index): IVoronoi => {
        const point = {
            x: diagram.circumcenters[index * 2],
            y: diagram.circumcenters[index * 2 + 1]
        };
        const corners = cell.map((c): IObject => {
            return {
                x: c[0],
                y: c[1]
            };
        });
        return {
            point,
            corners
        };
    });
};

/**
 * Spread out voronoi cells evenly by removing tight knit clusters of random points.
 * @param voronois A random set of points with voronoi information included.
 */
const lloydRelaxation = (voronois: IVoronoi[]): IObject[] => {
    const weightedDistance = () => {
        return 1;
    };
    // computer the weighted average of the corners of a voronoi cell
    const weightedAverageOfCorners = (voronoi: IVoronoi): IObject => {
        // compute weights for each point based on squared distance, farther away points will have more weights,
        // assume that by moving towards farther away points, the clusters of random points will spread out
        const pointsWithWeights = voronoi.corners.reduce((acc: Array<{weight: number, corner: IObject}>, corner: IObject) => {
            const weight = weightedDistance();
            return [
                ...acc,
                {
                    weight,
                    corner
                }
            ];
        }, []);

        // compute the sum point and sum weight
        const newPointWithWeight = pointsWithWeights.reduce((acc, pointWithWeight) => {
            return {
                weight: acc.weight + pointWithWeight.weight,
                corner: {
                    x: acc.corner.x + pointWithWeight.corner.x * pointWithWeight.weight,
                    y: acc.corner.y + pointWithWeight.corner.y * pointWithWeight.weight
                }
            }
        }, {
            weight: 0,
            corner: {
                x: 0,
                y: 0
            }
        });

        // divide sum point by sum weight to get a weighted average
        return {
            x: newPointWithWeight.corner.x / newPointWithWeight.weight,
            y: newPointWithWeight.corner.y / newPointWithWeight.weight
        };
    };
    // approximate lloyd's relaxation by averaging the corners.
    return voronois.map((voronoi): IObject => {
        return weightedAverageOfCorners(voronoi);
    });
};

/**
 * The size of a terrain tile. This is the smallest unit of terrain generation.
 */
const tileSize = 1000;
const generateTilePoints = (tileX: number, tileY: number, min: number, max: number): IObject[] => {
    const sha = shajs("sha256").update(`terrain-${tileX}-${tileY}`).digest("base64");
    const rng: seedrandom.prng = seedrandom.alea(sha);
    const numberOfPoints = Math.floor(rng.double() * (max - min)) + min;
    return new Array(numberOfPoints).fill(0).map(() => ({
        x: rng.double() * tileSize + tileX * tileSize,
        y: rng.double() * tileSize + tileY * tileSize
    }));
};

const terrainTilePosition = (offset: IObject): ITerrainTilePosition => {
    const tileX = Math.floor(offset.x / tileSize);
    const tileY = Math.floor(offset.y / tileSize);
    return {
        tileX,
        tileY
    };
};

/**
 * Generate points for terrain objects such as trees and rocks.
 * @param tileX The x axis of the terrain tile position.
 * @param tileY the y axis of the terrain tile position.
 */
const generateTerrainPoints = ({tileX, tileY}: ITerrainTilePosition) => {
    // generate random points for the center tile and the surrounding tiles
    // surrounding tiles are required to smoothly generate random points between the edges of each tile
    let points: IObject[] = [];
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            points.push(...generateTilePoints(tileX + i, tileY + i, 10, 50));
        }
    }

    // for five steps, use lloyd's relaxation to smooth out the random points
    for (let step = 0; step < 5; step++) {
        const voronois = computeVoronoi(points, [(tileX - 1) * tileSize, (tileY - 1) * tileSize, tileSize * 3, tileSize * 3]);
        points = lloydRelaxation(voronois);
    }

    // keep only points that are in the current tile
    return points.filter(point => {
        const pointTileX = Math.floor(point.x / tileSize);
        const pointTileY = Math.floor(point.y / tileSize);
        return tileX === pointTileX && tileY === pointTileY;
    }).map(point => {
        // round position to the nearest 10 to align with the grid
        return {
            x: Math.floor(point.x / 10) * 10,
            y: Math.floor(point.y / 10) * 10
        };
    }).reduce((acc: IObject[], point: IObject): IObject[] => {
        // if point is unique, not in array
        if (acc.every(p => p.x !== point.x && p.y !== point.y)) {
            // add unique point
            return [...acc, point];
        } else {
            // do not add duplicate point
            return acc;
        }
    }, []);
};

/**
 * Terrain tiles that should be loaded given a terrain tile position.
 * @param tileX Terrain tile position on the x axis.
 * @param tileY Terrain tile position on the y axis.
 */
const terrainTilesThatShouldBeLoaded = ({tileX, tileY}: ITerrainTilePosition) => {
    const tiles = [];
    for (let i = -1; i <= 3; i++) {
        for (let j = -1; j <= 3; j++) {
            tiles.push({
                tileX: tileX + i,
                tileY: tileY + j
            });
        }
    }
    return tiles;
};

interface ITerrainResourceData {
    objectType: ENetworkObjectType;
    probability: number;
}
const terrainResourceData: ITerrainResourceData[] = [{
    objectType: ENetworkObjectType.TREE,
    probability: 80
}, {
    objectType: ENetworkObjectType.ROCK,
    probability: 10
}, {
    objectType: ENetworkObjectType.POND,
    probability: 10
}];
const sumCumulativeTerrainResourceData: number = terrainResourceData.reduce((acc: number, data: ITerrainResourceData): number => {
    return acc + data.probability;
}, 0);
const cumulativeTerrainResourceData: ITerrainResourceData[] = terrainResourceData.map((data, index, arr) => {
    return {
        ...data,
        probability: arr.slice(0, index).reduce((acc: number, data2: ITerrainResourceData): number => {
            return acc + data2.probability;
        }, 0)
    }
}).reverse();

/**
 * Generate a terrain tile.
 * @param tilePosition The tile position to generate.
 */
const generateTerrainTile = (tilePosition: ITerrainTilePosition): IResource[] => {
    return generateTerrainPoints(tilePosition).map((point): IResource => {
        const rng: seedrandom.prng = seedrandom.alea(`resource(${point.x},${point.y})`);
        const spawnChance = rng.quick() * sumCumulativeTerrainResourceData;
        const spawn = cumulativeTerrainResourceData.find(data => data.probability < spawnChance) as ITerrainResourceData;
        return createResource(point, spawn.objectType);
    });
};

/**
 * Update the terrain, loading and unloading trees and rocks around the player. It should generate an infinite terrain effect.
 */
export const updateTerrain = async ({currentPerson}: {currentPerson: IPersonDatabase}) => {
    // get current terrain tile position
    const tilePosition = currentPerson ?
        terrainTilePosition(currentPerson) :
        {tileX: 0, tileY: 0};

    // get terrain tiles that should be loaded
    const terrainTilesToLoad = terrainTilesThatShouldBeLoaded(tilePosition);
    const newTerrainTiles: ITerrainTilePosition[] = (await Promise.all(terrainTilesToLoad.map((terrainTile) => {
        return admin.firestore().collection("terrainTiles").doc(terrainTileToId(terrainTile)).get().then((documentSnapshot) => {
            return {
                terrainTile,
                documentSnapshot
            };
        });
    }))).filter(({documentSnapshot}) => {
        return !documentSnapshot.exists;
    }).map(({terrainTile}) => terrainTile);

    // send messages to pub sub to concurrently generate terrain tiles
    const pubSub = new PubSub();
    await Promise.all(newTerrainTiles.map(terrainTile => {
        const data = Buffer.from(JSON.stringify({terrainTile}));
        return pubSub.topic("generateTerrain").publish(data);
    }));
};

/**
 * PubSub handler for generating and saving terrain tiles.
 * @param terrainTile The terrain tile to generate.
 */
export const handleGenerateTerrainTile = async (terrainTile: ITerrainTilePosition) => {
    // create resources
    const newResources: IResource[] = generateTerrainTile(terrainTile);

    // save resources in batches of 100
    const batchSize = 100;
    let batch = newResources.splice(0, batchSize);
    while (batch.length > 0) {
        const batchWrite = admin.firestore().batch();
        // save a batch
        batch.forEach(resource => {
            batchWrite.set(admin.firestore().collection("resources").doc(resource.id),
                resourceClientToDatabase(resource),
                {
                    merge: true
                }
            );
        });
        await batchWrite.commit();

        // create new batch
        batch = newResources.splice(0, batchSize);
    }

    // save new terrain tiles
    await admin.firestore().collection("terrainTiles").doc(terrainTileToId(terrainTile)).set(terrainTile, {merge: true});
};

const harvestResource = async (resourceId: string) => {
    await admin.firestore().runTransaction(async (transaction) => {
        // check to see if resource exists
        const resourceDocument = await transaction.get(admin.firestore().collection("resources").doc(resourceId));
        if (resourceDocument.exists) {
            const resource = resourceDocument.data() as IResourceDatabase;
            // resource is ready to be harvested
            if (!resource.depleted || resource.readyTime.toMillis() <= +new Date()) {
                const controller = new HarvestResourceController(resource as any);
                const {
                    spawn,
                    respawnTime
                } = controller.spawn();

                if (spawn) {
                    const spawnData: INetworkObjectDatabase = {
                        ...spawn,
                        lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(spawn.lastUpdate)),
                        cell: getNetworkObjectCellString(spawn)
                    };
                    const resourceUpdate: Partial<IResourceDatabase> = {
                        spawnState: controller.saveState(),
                        lastUpdate: admin.firestore.Timestamp.now(),
                        depleted: true,
                        readyTime: admin.firestore.Timestamp.fromMillis(+new Date() + respawnTime)
                    };

                    transaction.set(admin.firestore().collection("objects").doc(spawnData.id), spawnData, {merge: true});
                    transaction.set(admin.firestore().collection("resources").doc(resourceId), resourceUpdate, {merge: true});
                }
            }
        }
    });
};

export const handleHarvestResource = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        const resourceId = req.body.resourceId as IApiPersonsResourceHarvestPost;
        if (typeof resourceId === "string") {
            await harvestResource(resourceId);
            res.sendStatus(200);
        } else {
            res.status(400).json({
                message: "include the resourceId to harvest a specific resource"
            });
        }
    })().catch((err) => next(err));
};
