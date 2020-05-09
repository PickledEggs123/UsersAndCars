import {
    ENetworkObjectType, IApiPersonsResourceHarvestPost,
    IObject,
    IResource,
    IResourceSpawn,
    ITerrainTilePosition,
    ITree,
    IVoronoi
} from "./types/GameTypes";
import * as shajs from "sha.js";
import * as seedrandom from "seedrandom";
import {INetworkObjectDatabase, IPersonDatabase, IResourceDatabase} from "./types/database";
import admin from "firebase-admin";
import {PubSub} from "@google-cloud/pubsub";
import {getNetworkObjectCellString} from "./cell";
import express from "express";

/**
 * Convert terrain tile to an id.
 * @param terrainTile
 */
const terrainTileToId = (terrainTile: ITerrainTilePosition): string => `terrainTile(${terrainTile.tileX},${terrainTile.tileY})`;

/**
 * Compute the voronoi diagram for a set of points.
 * @param points The input points.
 */
const computeVoronoi = (points: IObject[]): IVoronoi[] => {
    // distance between two points
    const distance = (a: IObject, b: IObject): number => {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    };
    // for each point
    return points.map((point, i, acc): IVoronoi => {
        // compute corners
        const corners = points.filter(otherPoint => {
            return otherPoint !== point;
        }).filter(otherPoint => {
            // corners are otherPoints that are closer to point than otherOtherPoints.
            const distanceFromPointToOtherPoint = distance(point, otherPoint);
            return distanceFromPointToOtherPoint > 0 && points.filter(otherOtherPoint => {
                return otherOtherPoint !== point && otherOtherPoint !== otherPoint && distance(otherPoint, otherOtherPoint) > 0;
            }).every(otherOtherPoint => {
                return distanceFromPointToOtherPoint <= distance(otherPoint, otherOtherPoint);
            });
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
    const weightedDistance = (a: IObject, b: IObject) => {
        return 1;
    };
    // computer the weighted average of the corners of a voronoi cell
    const weightedAverageOfCorners = (voronoi: IVoronoi): IObject => {
        // compute weights for each point based on squared distance, farther away points will have more weights,
        // assume that by moving towards farther away points, the clusters of random points will spread out
        const pointsWithWeights = voronoi.corners.reduce((acc: Array<{weight: number, corner: IObject}>, corner: IObject) => {
            const weight = weightedDistance(voronoi.point, corner);
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
            points.push(...generateTilePoints(tileX + i, tileY + i, 10, 25));
        }
    }

    // for five steps, use lloyd's relaxation to smooth out the random points
    for (let step = 0; step < 5; step++) {
        const voronois = computeVoronoi(points);
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

/**
 * Generate a terrain tile.
 * @param tilePosition The tile position to generate.
 */
const generateTerrainTile = (tilePosition: ITerrainTilePosition): IResource[] => {
    return generateTerrainPoints(tilePosition).map((point): IResource => {
        const {x, y} = point;
        const rng: seedrandom.prng = seedrandom.alea(`resource(${x},${y})`);
        const objectType: ENetworkObjectType = rng.quick() > 0.9 ? ENetworkObjectType.ROCK : ENetworkObjectType.TREE;
        const spawns: IResourceSpawn[] = objectType === ENetworkObjectType.TREE ? [{
            type: ENetworkObjectType.WOOD,
            probability: 100,
            spawnTime: 60000
        }] : [{
            type: ENetworkObjectType.STONE,
            probability: 70,
            spawnTime: 60000
        }, {
            type: ENetworkObjectType.COAL,
            probability: 20,
            spawnTime: 120000
        }, {
            type: ENetworkObjectType.IRON,
            probability: 10,
            spawnTime: 180000
        }];
        const resource: IResource = {
            id: `resource(${x},${y})`,
            x,
            y,
            objectType,
            spawnSeed: `resource(${x},${y})`,
            spawns,
            lastUpdate: new Date().toISOString(),
            grabbedByPersonId: null,
            health: {
                rate: 0,
                max: 10,
                value: 10
            },
            depleted: false,
            readyTime: new Date().toISOString(),
            spawnState: true
        };
        if (objectType === ENetworkObjectType.TREE) {
            const tree: ITree = {
                ...resource as ITree,
                treeSeed: `tree(${x},${y})`
            };
            return {...tree};
        } else {
            return resource;
        }
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
        // save a batch
        await Promise.all(batch.map(resource => {
            return admin.firestore().collection("resources").doc(resource.id).set({
                ...resource,
                cell: getNetworkObjectCellString(resource)
            }, {merge: true});
        }));

        // create new batch
        batch = newResources.splice(0, batchSize);
    }

    // save new terrain tiles
    await admin.firestore().collection("terrainTiles").doc(terrainTileToId(terrainTile)).set(terrainTile, {merge: true});
};

const harvestResource = async (resourceId: string) => {
    // check to see if resource exists
    const resourceDocument = await admin.firestore().collection("resources").doc(resourceId).get();
    if (resourceDocument.exists) {
        const resource = resourceDocument.data() as IResourceDatabase;
        // resource is ready to be harvested
        if (!resource.depleted || resource.readyTime.toMillis() <= +new Date()) {
            // determine the spawn using a seeded random number generator
            const rng = seedrandom.alea(resource.spawnState === true ? resource.spawnSeed : "", {
                state: resource.spawnState
            });
            const spawns = resource.spawns;
            const spawn = spawns[Math.floor(rng.quick() * spawns.length)];

            // if spawn exists, create it and update random number generator
            if (spawn) {
                let spawnData: INetworkObjectDatabase = {
                    x: resource.x + Math.floor(rng.quick() * 200) - 100,
                    y: resource.y + Math.floor(rng.quick() * 200) - 100,
                    objectType: spawn.type,
                    lastUpdate: admin.firestore.Timestamp.now(),
                    health: {
                        rate: 0,
                        max: 1,
                        value: 1
                    },
                    id: `object-${rng.int32()}`,
                    grabbedByPersonId: null,
                    cell: ""
                };
                spawnData = {
                    ...spawnData,
                    cell: getNetworkObjectCellString(spawnData)
                };
                const respawnTime = Math.ceil(rng.quick() * spawn.spawnTime);
                const resourceUpdate: Partial<IResourceDatabase> = {
                    spawnState: rng.state(),
                    lastUpdate: admin.firestore.Timestamp.now(),
                    depleted: true,
                    readyTime: admin.firestore.Timestamp.fromMillis(+new Date() + respawnTime)
                };
                await Promise.all([
                    admin.firestore().collection("objects").doc(spawnData.id).set(spawnData, {merge: true}),
                    admin.firestore().collection("resources").doc(resourceId).set(resourceUpdate, {merge: true})
                ]);
            }
        }
    }
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
