import express from "express";
import admin from "firebase-admin";
import {INetworkObjectDatabase, IPersonDatabase} from "./types/database";
import {
    ENetworkObjectType,
    IApiPersonsObjectCraftPost,
    IApiPersonsObjectDropPost,
    IApiPersonsObjectPickUpPost, ICraftingRecipe,
    INetworkObject, IPerson, listOfRecipes
} from "persons-game-common/lib/types/GameTypes";
import {InventoryController} from "persons-game-common/lib/inventory";
import {getNetworkObjectCellString} from "./cell";

const networkObjectDatabaseToClient = (networkObjectDatabase: INetworkObjectDatabase): INetworkObject => ({
    ...networkObjectDatabase,
    lastUpdate: networkObjectDatabase.lastUpdate.toDate().toISOString()
});
const networkObjectClientToDatabase = (networkObjectClient: INetworkObject): INetworkObjectDatabase => ({
    ...networkObjectClient,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(networkObjectClient.lastUpdate)),
    cell: getNetworkObjectCellString(networkObjectClient)
});
const personDatabaseToClient = (personDatabase: IPersonDatabase): IPerson => ({
    ...personDatabase,
    lastUpdate: personDatabase.lastUpdate.toDate().toISOString(),
    inventory: {
        ...personDatabase.inventory,
        slots: personDatabase.inventory.slots.map(networkObjectDatabaseToClient)
    }
});
const personClientToDatabase = (personClient: IPerson): IPersonDatabase => ({
    ...personClient,
    lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(personClient.lastUpdate)),
    inventory: {
        ...personClient.inventory,
        slots: personClient.inventory.slots.map(networkObjectClientToDatabase)
    },
    password: "",
    cell: getNetworkObjectCellString(personClient)
});

/**
 * Pick an object up.
 * @param objectId The object to pick up.
 * @param personId The person which will pick up the object.
 */
const pickUpObject = async ({objectId, personId}: {objectId: string, personId: string}) => {
    // check to see that both the person and object exists
    const objectDocument = await admin.firestore().collection("objects").doc(objectId).get();
    const personDocument = await admin.firestore().collection("persons").doc(personId).get();
    if (objectDocument.exists && personDocument.exists) {
        // they both exist, get the data
        const objectData = objectDocument.data() as INetworkObjectDatabase;
        const personData = personDocument.data() as IPersonDatabase;

        // convert from database to client format so controller can use it
        const objectDataClient = networkObjectDatabaseToClient(objectData);
        const personDataClient = personDatabaseToClient(personData);

        // use controller to pick up item
        const controller = new InventoryController(personDataClient);
        const {
            updatedItem: updatedItemClient,
            stackableSlots: stackableSlotsClient
        } = controller.pickUpItem(objectDataClient);

        // convert controller result from client into database
        const updatedItem: INetworkObjectDatabase | null = updatedItemClient ? networkObjectClientToDatabase(updatedItemClient) : null;
        const newPersonData: IPersonDatabase = personClientToDatabase({
            ...personDataClient,
            inventory: controller.getInventory()
        });
        const stackableSlot: INetworkObjectDatabase | null = stackableSlotsClient[0] ? networkObjectClientToDatabase(stackableSlotsClient[0]) : null;

        // update both the person and the object
        await Promise.all([
            // update person's inventory
            admin.firestore().collection("persons").doc(personId).set(newPersonData, {merge: true}),
            // update or delete the picked up item. If there was a stackable slot, delete old item, else, update old item
            updatedItem ?
                admin.firestore().collection("objects").doc(objectId).set(updatedItem, {merge: true}) :
                admin.firestore().collection("objects").doc(objectId).delete(),
            // update a stackable slot if there was a stackable slot update
            stackableSlot ?
                admin.firestore().collection("objects").doc(stackableSlot.id).set(stackableSlot, {merge: true}) :
                null
        ]);
    }
};

/**
 * Drop an object.
 * @param objectId The object to drop.
 * @param personId The person which will drop the object.
 */
const dropObject = async ({objectId, personId}: {objectId: string, personId: string}) => {
    // check to see that both the person and object exists
    const objectDocument = await admin.firestore().collection("objects").doc(objectId).get();
    const personDocument = await admin.firestore().collection("persons").doc(personId).get();
    if (objectDocument.exists && personDocument.exists) {
        // they both exist, get the data
        const objectData = objectDocument.data() as INetworkObjectDatabase;
        const personData = personDocument.data() as IPersonDatabase;

        // convert database into client for use in controller
        const objectDataClient: INetworkObject = networkObjectDatabaseToClient(objectData);
        const personDataClient: IPerson = personDatabaseToClient(personData);

        // use controller to drop the item
        const controller = new InventoryController(personDataClient);
        const {
            updatedItem: updatedItemClient
        } = controller.dropItem(objectDataClient);

        // convert controller's client data into database
        const updatedItem: INetworkObjectDatabase = networkObjectClientToDatabase(updatedItemClient as INetworkObject);
        const newPersonData: IPersonDatabase = personClientToDatabase({
            ...personDataClient,
            inventory: controller.getInventory()
        });

        // update both the person and the object
        await Promise.all([
            admin.firestore().collection("persons").doc(personId).set(newPersonData, {merge: true}),
            admin.firestore().collection("objects").doc(objectId).set(updatedItem, {merge: true})
        ]);
    }
};

/**
 * Pick an object up.
 * @param objectId The object to pick up.
 * @param personId The person which will pick up the object.
 */
const craftObject = async ({personId, recipeProduct}: {personId: string, recipeProduct: ENetworkObjectType}) => {
    // check to see that the person exists
    const personDocument = await admin.firestore().collection("persons").doc(personId).get();
    if (personDocument.exists) {
        // get the data
        const personData = personDocument.data() as IPersonDatabase;

        // convert from database to client format so controller can use it
        const personDataClient = personDatabaseToClient(personData);

        // get recipe
        const recipe = listOfRecipes.find(r => r.product === recipeProduct) as ICraftingRecipe;

        // use controller to pick up item
        const controller = new InventoryController(personDataClient);
        const {
            updatedItem: updatedItemClient,
            stackableSlots: stackableSlotsClient,
            deletedSlots,
            modifiedSlots: modifiedSlotsClient
        } = controller.craftItem(recipe);

        // convert controller result from client into database
        const inventory = controller.getInventory();
        const updatedItem: INetworkObjectDatabase | null = updatedItemClient ? networkObjectClientToDatabase(updatedItemClient) : null;
        const newPersonData: IPersonDatabase = personClientToDatabase({
            ...personDataClient,
            inventory
        });
        const stackableSlot: INetworkObjectDatabase | null = stackableSlotsClient[0] ? networkObjectClientToDatabase(stackableSlotsClient[0]) : null;
        const modifiedSlots: INetworkObjectDatabase[] = modifiedSlotsClient.map(m => networkObjectClientToDatabase(m));

        // update both the person and the object
        await Promise.all([
            // update person's inventory
            admin.firestore().collection("persons").doc(personId).set(newPersonData, {merge: true}),
            // update or delete the picked up item. If there was a stackable slot, delete old item, else, update old item
            updatedItem ?
                admin.firestore().collection("objects").doc(updatedItem.id).set(updatedItem, {merge: true}) :
                null,
            // update a stackable slot if there was a stackable slot update
            stackableSlot ?
                admin.firestore().collection("objects").doc(stackableSlot.id).set(stackableSlot, {merge: true}) :
                null,
            // update modified slots
            modifiedSlots.map(m => {
                return admin.firestore().collection("objects").doc(m.id).set(m, {merge: true});
            }),
            // delete items used during crafting
            deletedSlots.map(deleteId => {
                return admin.firestore().collection("objects").doc(deleteId).delete();
            })
        ]);
    }
};

export const handlePickUpObject = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        const {personId, objectId} = req.body as IApiPersonsObjectPickUpPost;;
        if (typeof personId === "string" && typeof objectId === "string") {
            await pickUpObject({personId, objectId});
            res.sendStatus(200);
        } else {
            res.status(400).json({
                message: "require personId and objectId"
            });
        }
    })().catch((err) => next(err));
};

export const handleDropObject = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        const {personId, objectId} = req.body as IApiPersonsObjectDropPost;
        if (typeof personId === "string" && typeof objectId === "string") {
            await dropObject({personId, objectId});
            res.sendStatus(200);
        } else {
            res.status(400).json({
                message: "require personId and objectId"
            });
        }
    })().catch((err) => next(err));
};

export const handleCraftObject = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        const {personId, recipeProduct} = req.body as IApiPersonsObjectCraftPost;;
        if (typeof personId === "string" && typeof recipeProduct === "string") {
            await craftObject({personId, recipeProduct});
            res.sendStatus(200);
        } else {
            res.status(400).json({
                message: "require personId and objectId"
            });
        }
    })().catch((err) => next(err));
};
