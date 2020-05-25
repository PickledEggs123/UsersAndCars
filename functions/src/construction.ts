import {IApiPersonsConstructionPost, IFloor, IHouse, IWall} from "persons-game-common/lib/types/GameTypes";
import {ConstructionController} from "persons-game-common/lib/construction";
import admin from "firebase-admin";
import {
    getSimpleCollection,
    networkObjectClientToDatabase,
    personClientToDatabase,
    personDatabaseToClient
} from "./common";
import {IPersonDatabase} from "./types/database";
import * as express from "express";

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
        const inventory = controller.getState().inventoryHolder.inventory;
        const newPersonData: Partial<IPersonDatabase> = personClientToDatabase({
            ...personClient,
            inventory
        });

        // update database with result of construction
        await Promise.all([
            // update construction objects in the world
            ...housesToAdd.map(house => admin.firestore().collection("houses").doc(house.id).set(networkObjectClientToDatabase(house), {merge: true})),
            ...housesToRemove.map(house => admin.firestore().collection("houses").doc(house.id).delete()),
            ...wallsToAdd.map(wall => admin.firestore().collection("walls").doc(wall.id).set(networkObjectClientToDatabase(wall), {merge: true})),
            ...wallsToRemove.map(wall => admin.firestore().collection("walls").doc(wall.id).delete()),
            ...floorsToAdd.map(floor => admin.firestore().collection("floors").doc(floor.id).set(networkObjectClientToDatabase(floor), {merge: true})),
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
