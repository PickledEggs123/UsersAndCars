import {
    IApiPersonsConstructionPost,
    IApiPersonsConstructionStockpilePost,
    IFloor,
    IHouse, IPerson, IStockpileTile,
    IWall,
} from "persons-game-common/lib/types/GameTypes";
import {ConstructionController} from "persons-game-common/lib/construction";
import admin from "firebase-admin";
import {
    floorClientToDatabase,
    getSimpleCollection,
    houseClientToDatabase,
    networkObjectClientToDatabase,
    personClientToDatabase,
    personDatabaseToClient,
    stockpileClientToDatabase,
    stockpileDatabaseToClient,
    stockpileTileClientToDatabase,
    wallClientToDatabase
} from "./common";
import {IPersonDatabase, IStockpileDatabase} from "./types/database";
import * as express from "express";
import {StockpileController} from "persons-game-common/lib/stockpile";
import {getRelevantNetworkObjectCells} from "./cell";

const constructLocation = async ({personId, location}: IApiPersonsConstructionPost) => {
    await admin.firestore().runTransaction(async (transaction) => {
        // get current person, who is building something and will use their inventory to build with
        const personDocument = await transaction.get(admin.firestore().collection("persons").doc(personId));
        if (personDocument.exists) {
            // person exist, convert to client format for controller
            const personDatabase: IPersonDatabase = personDocument.data() as IPersonDatabase;
            const personClient = personDatabaseToClient(personDatabase);

            // get relevant construction objects near person
            const floorsClient = await getSimpleCollection<IFloor>(personDatabase, "floors", {transaction});
            const wallsClient = await getSimpleCollection<IWall>(personDatabase, "walls", {transaction});
            const housesClient = await getSimpleCollection<IHouse>(personDatabase, "houses", {transaction});

            // perform construction task
            const controller = new ConstructionController({
                inventoryHolder: personClient,
                floors: floorsClient,
                walls: wallsClient,
                houses: housesClient
            });
            const {
                housesToRemove,
                housesToAdd,
                wallsToRemove,
                wallsToAdd,
                floorsToRemove,
                floorsToAdd,
                updatedItems,
                modifiedSlots,
                deletedSlots,
                stackableSlots
            } = controller.constructBuilding({location});

            // convert inventory result into database format
            const newPersonData: Partial<IPersonDatabase> = personClientToDatabase({
                ...personClient,
                ...controller.getState().inventoryHolder as Partial<IPerson>
            });

            // update database with result of construction
            // update construction objects in the world
            housesToAdd.forEach(house => {
                transaction.set(admin.firestore().collection("houses").doc(house.id), houseClientToDatabase(house), {merge: true});
            });
            housesToRemove.forEach(house => {
                transaction.delete(admin.firestore().collection("houses").doc(house.id));
            });
            wallsToAdd.forEach(wall => {
                transaction.set(admin.firestore().collection("walls").doc(wall.id), wallClientToDatabase(wall), {merge: true});
            });
            wallsToRemove.forEach(wall => {
                transaction.delete(admin.firestore().collection("walls").doc(wall.id));
            });
            floorsToAdd.forEach(floor => {
                transaction.set(admin.firestore().collection("floors").doc(floor.id), floorClientToDatabase(floor), {merge: true});
            });
            floorsToRemove.forEach(floor => {
                transaction.delete(admin.firestore().collection("floors").doc(floor.id));
            });

            // update inventory
            transaction.set(admin.firestore().collection("persons").doc(personId), newPersonData, {merge: true});
            [
                ...updatedItems,
                ...modifiedSlots,
                ...stackableSlots
            ].forEach(item => {
                transaction.set(admin.firestore().collection("objects").doc(item.id), networkObjectClientToDatabase(item), {merge: true});
            });
            deletedSlots.forEach(itemId => {
                transaction.delete(admin.firestore().collection("objects").doc(itemId));
            });
        } else {
            throw new Error("Person does not exist");
        }
    });
};

export const handleConstructionRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        const {
            personId,
            location
        } = req.body;
        await constructLocation({personId, location});
        res.sendStatus(200);
    })().catch((err) => next(err));
};

/**
 * Construct a stockpile.
 * @param personId
 * @param location
 */
const constructStockpile = async ({personId, location}: IApiPersonsConstructionStockpilePost) => {
    await admin.firestore().runTransaction(async (transaction) => {
        // get current person, who is building something and will use their inventory to build with
        const personDocument = await transaction.get(admin.firestore().collection("persons").doc(personId));
        if (personDocument.exists) {
            // person exist, convert to client format for controller
            const personDatabase: IPersonDatabase = personDocument.data() as IPersonDatabase;
            const personClient = personDatabaseToClient(personDatabase);

            // get relevant construction objects near person
            const stockpileQuery = await transaction.get(admin.firestore().collection("stockpiles")
                .where("cell", "in", getRelevantNetworkObjectCells(personDatabase)));
            const stockpilesClient = stockpileQuery.docs.map(doc => stockpileDatabaseToClient(doc.data() as IStockpileDatabase));
            const stockpileTilesClient = await getSimpleCollection<IStockpileTile>(personDatabase, "stockpileTiles", {transaction});

            // perform construction task
            const controller = new StockpileController({
                person: personClient,
                stockpiles: stockpilesClient,
                stockpileTiles: stockpileTilesClient,
            });
            const {
                stockpileTilesToRemove,
                stockpileTilesToModify,
                stockpileTilesToAdd,
                stockpilesToRemove,
                stockpilesToModify,
                stockpilesToAdd
            } = controller.constructStockpile({location});

            // update database with result of construction
            // update construction objects in the world
            [
                ...stockpilesToAdd,
                ...stockpilesToModify
            ].forEach(stockpile => {
                transaction.set(admin.firestore().collection("stockpiles").doc(stockpile.id), stockpileClientToDatabase(stockpile), {merge: true});
            });
            stockpilesToRemove.forEach(stockpile => {
                transaction.delete(admin.firestore().collection("stockpiles").doc(stockpile.id));
            });
            [
                ...stockpileTilesToAdd,
                ...stockpileTilesToModify
            ].forEach(tile => {
                transaction.set(admin.firestore().collection("stockpileTiles").doc(tile.id), stockpileTileClientToDatabase(tile), {merge: true});
            });
            stockpileTilesToRemove.forEach(tile => {
                transaction.delete(admin.firestore().collection("stockpileTiles").doc(tile.id));
            });
        } else {
            throw new Error("Person does not exist");
        }
    });
};

export const handleStockpileConstructionRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        const {
            personId,
            location
        } = req.body;
        await constructStockpile({personId, location});
        res.sendStatus(200);
    })().catch((err) => next(err));
};
