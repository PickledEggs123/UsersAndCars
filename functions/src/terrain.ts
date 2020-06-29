import {
    IApiPersonsResourceHarvestPost, IResource,
    ITerrainTilePosition,
} from "persons-game-common/lib/types/GameTypes";
import {INetworkObjectDatabase, IPersonDatabase, IResourceDatabase} from "./types/database";
import admin from "firebase-admin";
import {PubSub} from "@google-cloud/pubsub";
import express from "express";
import {HarvestResourceController} from "persons-game-common/lib/resources";
import {createCellLock, resourceClientToDatabase, resourceDatabaseToClient} from "./common";
import {
    generateTerrainForLocation,
    getTerrainTilePosition, IGeneratedResources,
    terrainTileSize,
    terrainTilesThatShouldBeLoaded,
    terrainTileToId
} from "persons-game-common/lib/terrain";
import {getNetworkObjectCellString} from "persons-game-common/lib/cell";

/**
 * Update the terrain, loading and unloading trees and rocks around the player. It should generate an infinite terrain effect.
 */
export const updateTerrain = async ({currentPerson}: {currentPerson: IPersonDatabase}) => {
    // get current terrain tile position
    const tilePosition = currentPerson ?
        getTerrainTilePosition(currentPerson) :
        {tileX: 0, tileY: 0};

    // get terrain tiles that should be loaded
    const terrainTilesToLoad: ITerrainTilePosition[] = terrainTilesThatShouldBeLoaded(tilePosition);
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

const saveTerrainTileWithResources = async (terrainTile: ITerrainTilePosition, resources: IResource[]) => {
    // run a transaction to lock specific terrain tiles to save, do not save the same terrain tile twice
    await admin.firestore().runTransaction(async (transaction) => {
        // only if terrain tile does not exist
        const terrainTileDoc = await transaction.get(admin.firestore().collection("terrainTiles").doc(terrainTileToId(terrainTile)));

        if (!terrainTileDoc.exists) {
            // add all new resources
            for (const resource of resources) {
                transaction.set(admin.firestore().collection("resources").doc(resource.id), resourceClientToDatabase(resource), {merge: true});
            }

            // add new terrain tile
            transaction.create(terrainTileDoc.ref, terrainTile);
        }
    });
};

/**
 * PubSub handler for generating and saving terrain tiles.
 * @param terrainTile The terrain tile to generate.
 */
export const handleGenerateTerrainTile = async (terrainTile: ITerrainTilePosition) => {
    // create resources
    const newResourceData: IGeneratedResources[] = generateTerrainForLocation(terrainTile, {
        x: terrainTile.tileX * terrainTileSize,
        y: terrainTile.tileY * terrainTileSize
    });

    // get all resources within terrain tile to the maximum limit of 200 resource nodes within the terrain tile (2000 by 2000 area).
    const resources: IResource[] = newResourceData.reduce((acc: IResource[], newData): IResource[] => {
        return [
            ...acc,
            ...newData.resources
        ];
    }, []).filter((resource) => {
        return Math.floor(resource.x / terrainTileSize) === terrainTile.tileX && Math.floor(resource.y / terrainTileSize) ===terrainTile.tileY;
    }).slice(0, 200);

    await saveTerrainTileWithResources(terrainTile, resources);
};

const harvestResource = async (resourceId: string) => {
    const cellString = await admin.firestore().runTransaction(async (transaction): Promise<string | null> => {
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
                    createCellLock(resourceDatabaseToClient(resource), transaction);

                    return getNetworkObjectCellString(resource);
                }
            }
        }

        return null;
    });

    // restart npc tick for cell after player modification
    if (cellString) {
        const pubSubClient = new PubSub();
        const data = Buffer.from(JSON.stringify({cellString}));
        await pubSubClient.topic("npc").publish(data);
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
