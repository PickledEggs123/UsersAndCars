import express from "express";
import admin from "firebase-admin";
import {INetworkObjectDatabase, IPersonDatabase, IStockpileDatabase} from "./types/database";
import {
    ENetworkObjectType,
    IApiPersonsObjectCraftPost,
    IApiPersonsObjectDropPost,
    IApiPersonsObjectPickUpPost, IApiPersonsStockpileDepositPost, IApiPersonsStockpileWithdrawPost,
    ICraftingRecipe,
    INetworkObject,
    IPerson
} from "persons-game-common/lib/types/GameTypes";
import {InventoryController, listOfRecipes} from "persons-game-common/lib/inventory";
import {
    networkObjectClientToDatabase,
    networkObjectDatabaseToClient,
    personClientToDatabase,
    personDatabaseToClient, stockpileClientToDatabase, stockpileDatabaseToClient
} from "./common";

/**
 * Pick an object up.
 * @param objectId The object to pick up.
 * @param personId The person which will pick up the object.
 */
const pickUpObject = async ({objectId, personId}: {objectId: string, personId: string}) => {
    await admin.firestore().runTransaction(async (transaction) => {
        // check to see that both the person and object exists
        const objectDocument = await transaction.get(admin.firestore().collection("objects").doc(objectId));
        const personDocument = await transaction.get(admin.firestore().collection("persons").doc(personId));
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
            const newPersonData: Partial<IPersonDatabase> = personClientToDatabase({
                ...personDataClient,
                inventory: controller.getInventory()
            });
            const stackableSlot: INetworkObjectDatabase | null = stackableSlotsClient[0] ? networkObjectClientToDatabase(stackableSlotsClient[0]) : null;

            // update both the person and the object
            // update person's inventory
            transaction.set(admin.firestore().collection("persons").doc(personId), newPersonData, {merge: true});
            // update or delete the picked up item. If there was a stackable slot, delete old item, else, update old item
            if (updatedItem) {
                transaction.set(admin.firestore().collection("objects").doc(objectId), updatedItem, {merge: true});
            } else {
                transaction.delete(admin.firestore().collection("objects").doc(objectId));
            }
            // update a stackable slot if there was a stackable slot update
            if (stackableSlot) {
                transaction.set(admin.firestore().collection("objects").doc(stackableSlot.id), stackableSlot, {merge: true});
            }
        }
    });
};

/**
 * Drop an object.
 * @param objectId The object to drop.
 * @param personId The person which will drop the object.
 */
const dropObject = async ({objectId, personId}: {objectId: string, personId: string}) => {
    await admin.firestore().runTransaction(async (transaction) => {
        // check to see that both the person and object exists
        const objectDocument = await transaction.get(admin.firestore().collection("objects").doc(objectId));
        const personDocument = await transaction.get(admin.firestore().collection("persons").doc(personId));
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
            const newPersonData: Partial<IPersonDatabase> = personClientToDatabase({
                ...personDataClient,
                inventory: controller.getInventory()
            });

            // update both the person and the object
            transaction.set(admin.firestore().collection("persons").doc(personId), newPersonData, {merge: true});
            transaction.set(admin.firestore().collection("objects").doc(objectId), updatedItem, {merge: true});
        }
    });
};

/**
 * Pick an object up.
 * @param objectId The object to pick up.
 * @param personId The person which will pick up the object.
 */
const craftObject = async ({personId, recipeProduct}: {personId: string, recipeProduct: ENetworkObjectType}) => {
    await admin.firestore().runTransaction(async (transaction) => {
        // check to see that the person exists
        const personDocument = await transaction.get(admin.firestore().collection("persons").doc(personId));
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
            const updatedItem: INetworkObjectDatabase | null = updatedItemClient ? networkObjectClientToDatabase(updatedItemClient) : null;
            const newPersonData: Partial<IPersonDatabase> = personClientToDatabase({
                ...personDataClient,
                ...controller.getState() as Partial<IPerson>
            });
            const stackableSlot: INetworkObjectDatabase | null = stackableSlotsClient[0] ? networkObjectClientToDatabase(stackableSlotsClient[0]) : null;
            const modifiedSlots: INetworkObjectDatabase[] = modifiedSlotsClient.map(m => networkObjectClientToDatabase(m));

            // update both the person and the object
            // update person's inventory
            transaction.set(admin.firestore().collection("persons").doc(personId), newPersonData, {merge: true});
            // update or delete the picked up item. If there was a stackable slot, delete old item, else, update old item
            if (updatedItem) {
                transaction.set(admin.firestore().collection("objects").doc(updatedItem.id), updatedItem, {merge: true});
            }
            // update a stackable slot if there was a stackable slot update
            if (stackableSlot) {
                transaction.set(admin.firestore().collection("objects").doc(stackableSlot.id), stackableSlot, {merge: true});
            }
            // update modified slots
            modifiedSlots.forEach(m => {
                transaction.set(admin.firestore().collection("objects").doc(m.id), m, {merge: true});
            });
            // delete items used during crafting
            deletedSlots.forEach(deleteId => {
                transaction.delete(admin.firestore().collection("objects").doc(deleteId));
            });
        }
    });
};

/**
 * Withdraw an object from a stockpile.
 * @param objectId The object to withdraw.
 * @param personId The person which will withdraw the object.
 * @param stockpileId The stockpile which will be withdrawn from.
 * @param amount The amount to withdraw.
 */
const withdrawObject = async ({
    objectId,
    personId,
    stockpileId,
    amount
}: {objectId: string, personId: string, stockpileId: string, amount: number}) => {
    await admin.firestore().runTransaction(async (transaction) => {
        // check to see that both the person and object exists
        const objectDocument = await transaction.get(admin.firestore().collection("objects").doc(objectId));
        const personDocument = await transaction.get(admin.firestore().collection("persons").doc(personId));
        const stockpileDocument = await transaction.get(admin.firestore().collection("stockpiles").doc(stockpileId));
        if (objectDocument.exists && personDocument.exists && stockpileDocument.exists) {
            // they both exist, get the data
            const objectData = objectDocument.data() as INetworkObjectDatabase;
            const personData = personDocument.data() as IPersonDatabase;
            const stockpileData = stockpileDocument.data() as IStockpileDatabase;

            // convert from database to client format so controller can use it
            const objectDataClient = networkObjectDatabaseToClient(objectData);
            const personDataClient = personDatabaseToClient(personData);
            const stockpileDataClient = stockpileDatabaseToClient(stockpileData);

            // use controller to withdraw item
            const personController = new InventoryController(personDataClient);
            const stockpileController = new InventoryController(stockpileDataClient);
            const {
                updatedItem: withdrawnItem
            } = stockpileController.withdrawFromStockpile(objectDataClient, amount);
            if (!withdrawnItem) {
                throw new Error("Withdrawn nothing from stockpile");
            }
            const {
                updatedItem: updatedItemClient,
                stackableSlots: stackableSlotsClient
            } = personController.pickUpItem(withdrawnItem);

            // convert controller result from client into database
            const updatedItem: INetworkObjectDatabase | null = updatedItemClient ? networkObjectClientToDatabase(updatedItemClient) : null;
            const newPersonData: Partial<IPersonDatabase> = personClientToDatabase({
                ...personDataClient,
                inventory: personController.getInventory()
            });
            const newStockpileData: Partial<IStockpileDatabase> = stockpileClientToDatabase({
                ...stockpileDataClient,
                inventory: stockpileController.getInventory()
            });
            const stackableSlot: INetworkObjectDatabase | null = stackableSlotsClient[0] ? networkObjectClientToDatabase(stackableSlotsClient[0]) : null;

            // update both the person, stockpile and the object
            // update person's inventory
            transaction.set(admin.firestore().collection("persons").doc(personId), newPersonData, {merge: true});
            // update stockpile's inventory
            transaction.set(admin.firestore().collection("stockpiles").doc(stockpileId), newStockpileData, {merge: true});
            // update or delete the picked up item. If there was a stackable slot, delete old item, else, update old item
            if (updatedItem) {
                transaction.set(admin.firestore().collection("objects").doc(objectId), updatedItem, {merge: true});
            } else {
                transaction.delete(admin.firestore().collection("objects").doc(objectId));
            }
            // update a stackable slot if there was a stackable slot update
            if (stackableSlot) {
                transaction.set(admin.firestore().collection("objects").doc(stackableSlot.id), stackableSlot, {merge: true});
            }
        }
    });
};

/**
 * Deposit an object into a stockpile.
 * @param objectId The object to deposit.
 * @param personId The person which will deposit the object.
 * @param stockpileId The stockpile which will be deposited into.
 */
const depositObject = async ({
    objectId,
    personId,
    stockpileId,
}: {objectId: string, personId: string, stockpileId: string}) => {
    await admin.firestore().runTransaction(async (transaction) => {
        // check to see that both the person and object exists
        const objectDocument = await transaction.get(admin.firestore().collection("objects").doc(objectId));
        const personDocument = await transaction.get(admin.firestore().collection("persons").doc(personId));
        const stockpileDocument = await transaction.get(admin.firestore().collection("stockpiles").doc(stockpileId));
        if (objectDocument.exists && personDocument.exists && stockpileDocument.exists) {
            // they both exist, get the data
            const objectData = objectDocument.data() as INetworkObjectDatabase;
            const personData = personDocument.data() as IPersonDatabase;
            const stockpileData = stockpileDocument.data() as IStockpileDatabase;

            // convert from database to client format so controller can use it
            const objectDataClient = networkObjectDatabaseToClient(objectData);
            const personDataClient = personDatabaseToClient(personData);
            const stockpileDataClient = stockpileDatabaseToClient(stockpileData);

            // use controller to withdraw item
            const personController = new InventoryController(personDataClient);
            const stockpileController = new InventoryController(stockpileDataClient);
            const {
                updatedItem: droppedItem
            } = personController.dropItem(objectDataClient);
            if (!droppedItem) {
                throw new Error("Nothing to deposit into stockpile");
            }
            const {
                updatedItem: updatedItemClient,
                stackableSlots: stackableSlotsClient
            } = stockpileController.insertIntoStockpile(droppedItem);

            // convert controller result from client into database
            const updatedItem: INetworkObjectDatabase | null = updatedItemClient ? networkObjectClientToDatabase(updatedItemClient) : null;
            const newPersonData: Partial<IPersonDatabase> = personClientToDatabase({
                ...personDataClient,
                inventory: personController.getInventory()
            });
            const newStockpileData: Partial<IStockpileDatabase> = stockpileClientToDatabase({
                ...stockpileDataClient,
                inventory: stockpileController.getInventory()
            });
            const stackableSlot: INetworkObjectDatabase | null = stackableSlotsClient[0] ? networkObjectClientToDatabase(stackableSlotsClient[0]) : null;

            // update both the person, stockpile and the object
            // update person's inventory
            transaction.set(admin.firestore().collection("persons").doc(personId), newPersonData, {merge: true});
            // update stockpile's inventory
            transaction.set(admin.firestore().collection("stockpiles").doc(stockpileId), newStockpileData, {merge: true});
            // update or delete the picked up item. If there was a stackable slot, delete old item, else, update old item
            if (updatedItem) {
                transaction.set(admin.firestore().collection("objects").doc(objectId), updatedItem, {merge: true});
            } else {
                transaction.delete(admin.firestore().collection("objects").doc(objectId));
            }
            // update a stackable slot if there was a stackable slot update
            if (stackableSlot) {
                transaction.set(admin.firestore().collection("objects").doc(stackableSlot.id), stackableSlot, {merge: true});
            }
        }
    });
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

export const handleWithdrawObjectFromStockpile = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        const {personId, objectId, stockpileId, amount} = req.body as IApiPersonsStockpileWithdrawPost;
        if (typeof personId === "string" && typeof objectId === "string" && typeof stockpileId === "string" && typeof amount === "number") {
            await withdrawObject({personId, objectId, stockpileId, amount});
            res.sendStatus(200);
        } else {
            res.status(400).json({
                message: "require personId and objectId"
            });
        }
    })().catch((err) => next(err));
};

export const handleDepositObjectIntoStockpile = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        const {personId, objectId, stockpileId} = req.body as IApiPersonsStockpileDepositPost;
        if (typeof personId === "string" && typeof objectId === "string" && typeof stockpileId === "string") {
            await depositObject({personId, objectId, stockpileId});
            res.sendStatus(200);
        } else {
            res.status(400).json({
                message: "require personId and objectId"
            });
        }
    })().catch((err) => next(err));
};
