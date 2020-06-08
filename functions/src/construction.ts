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
    // get current person, who is building something and will use their inventory to build with
    const personDocument = await admin.firestore().collection("persons").doc(personId).get();
    if (personDocument.exists) {
        // person exist, convert to client format for controller
        const personDatabase: IPersonDatabase = personDocument.data() as IPersonDatabase;
        const personClient = personDatabaseToClient(personDatabase);

        // get relevant construction objects near person
        const floorsClient = await getSimpleCollection<IFloor>(personDatabase, "floors");
        const wallsClient = await getSimpleCollection<IWall>(personDatabase, "walls");
        const housesClient = await getSimpleCollection<IHouse>(personDatabase, "houses");

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
        await Promise.all([
            // update construction objects in the world
            ...housesToAdd.map(house => admin.firestore().collection("houses").doc(house.id).set(houseClientToDatabase(house), {merge: true})),
            ...housesToRemove.map(house => admin.firestore().collection("houses").doc(house.id).delete()),
            ...wallsToAdd.map(wall => admin.firestore().collection("walls").doc(wall.id).set(wallClientToDatabase(wall), {merge: true})),
            ...wallsToRemove.map(wall => admin.firestore().collection("walls").doc(wall.id).delete()),
            ...floorsToAdd.map(floor => admin.firestore().collection("floors").doc(floor.id).set(floorClientToDatabase(floor), {merge: true})),
            ...floorsToRemove.map(floor => admin.firestore().collection("floors").doc(floor.id).delete()),
            // update inventory
            admin.firestore().collection("persons").doc(personId).set(newPersonData, {merge: true}),
            ...updatedItems.map(item => admin.firestore().collection("objects").doc(item.id).set(networkObjectClientToDatabase(item), {merge: true})),
            ...modifiedSlots.map(item => admin.firestore().collection("objects").doc(item.id).set(networkObjectClientToDatabase(item), {merge: true})),
            ...stackableSlots.map(item => admin.firestore().collection("objects").doc(item.id).set(networkObjectClientToDatabase(item), {merge: true})),
            ...deletedSlots.map(itemId => admin.firestore().collection("objects").doc(itemId).delete())
        ]);
    } else {
        throw new Error("Person does not exist");
    }
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
    // get current person, who is building something and will use their inventory to build with
    const personDocument = await admin.firestore().collection("persons").doc(personId).get();
    if (personDocument.exists) {
        // person exist, convert to client format for controller
        const personDatabase: IPersonDatabase = personDocument.data() as IPersonDatabase;
        const personClient = personDatabaseToClient(personDatabase);

        // get relevant construction objects near person
        const stockpileQuery = await admin.firestore().collection("stockpiles")
            .where("cell", "in", getRelevantNetworkObjectCells(personDatabase)).get();
        const stockpilesClient = stockpileQuery.docs.map(doc => stockpileDatabaseToClient(doc.data() as IStockpileDatabase));
        const stockpileTilesClient = await getSimpleCollection<IStockpileTile>(personDatabase, "stockpileTiles");

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
        console.log(stockpileTilesToAdd);
        await Promise.all([
            // update construction objects in the world
            ...[
                ...stockpilesToAdd,
                ...stockpilesToModify
            ].map(stockpile => admin.firestore().collection("stockpiles").doc(stockpile.id).set(stockpileClientToDatabase(stockpile), {merge: true})),
            ...stockpilesToRemove.map(stockpile => admin.firestore().collection("stockpiles").doc(stockpile.id).delete()),
            ...[
                ...stockpileTilesToAdd,
                ...stockpileTilesToModify,
            ].map(tile => admin.firestore().collection("stockpileTiles").doc(tile.id).set(stockpileTileClientToDatabase(tile), {merge: true})),
            ...stockpileTilesToRemove.map(tile => admin.firestore().collection("stockpileTiles").doc(tile.id).delete()),
        ]);
    } else {
        throw new Error("Person does not exist");
    }
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
