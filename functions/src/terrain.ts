import {
    IApiPersonsResourceHarvestPost,
    IResource,
    ITerrainTilePosition,
} from "persons-game-common/lib/types/GameTypes";
import {INetworkObjectDatabase, IPersonDatabase, IResourceDatabase} from "./types/database";
import admin from "firebase-admin";
import {PubSub} from "@google-cloud/pubsub";
import {getNetworkObjectCellString} from "./cell";
import express from "express";
import {HarvestResourceController} from "persons-game-common/lib/resources";
import {resourceClientToDatabase} from "./common";
import {
    generateTerrainForLocation,
    getTerrainTilePosition,
    terrainTileSize,
    terrainTilesThatShouldBeLoaded,
    terrainTileToId
} from "persons-game-common/lib/terrain";

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

/**
 * PubSub handler for generating and saving terrain tiles.
 * @param terrainTile The terrain tile to generate.
 */
export const handleGenerateTerrainTile = async (terrainTile: ITerrainTilePosition) => {
    // create resources
    const newResources: IResource[] = generateTerrainForLocation(terrainTile, {
        x: terrainTile.tileX * terrainTileSize,
        y: terrainTile.tileY * terrainTileSize
    });

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
