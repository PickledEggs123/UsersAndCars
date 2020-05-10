import express from "express";
import admin from "firebase-admin";
import {INetworkObjectDatabase, IPersonDatabase} from "./types/database";
import {IApiPersonsObjectDropPost, IApiPersonsObjectPickUpPost} from "./types/GameTypes";

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

        // create new object with isInInventory and grabbed by person
        const newObjectData: INetworkObjectDatabase = {
            ...objectData,
            isInInventory: true,
            grabbedByPersonId: personId,
            lastUpdate: admin.firestore.Timestamp.now()
        };

        // determine there is room for one more object
        const maxSlots = personData.inventory.rows * personData.inventory.columns;
        if (personData.inventory.slots.length < maxSlots) {
            // there is room, update slot with the new object
            const slots: INetworkObjectDatabase[] = [
                ...personData.inventory.slots,
                newObjectData
            ];

            // create new person data, with the person storing the object in their inventory
            const newPersonData: Partial<IPersonDatabase> = {
                inventory: {
                    ...personData.inventory,
                    slots
                },
                lastUpdate: admin.firestore.Timestamp.now()
            };

            // update both the person and the object
            await Promise.all([
                admin.firestore().collection("persons").doc(personId).set(newPersonData, {merge: true}),
                admin.firestore().collection("objects").doc(objectId).set(newObjectData, {merge: true})
            ]);
        }
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

        // create new object that is not in an inventory and is not grabbed
        const newObjectData: INetworkObjectDatabase = {
            ...objectData,
            isInInventory: false,
            grabbedByPersonId: null,
            x: personData.x,
            y: personData.y,
            lastUpdate: admin.firestore.Timestamp.now()
        };

        // there is room, update slot with the new object
        const slots: INetworkObjectDatabase[] = personData.inventory.slots.filter(o => o.id !== objectId);

        // create new person data, with the person storing the object in their inventory
        const newPersonData: Partial<IPersonDatabase> = {
            inventory: {
                ...personData.inventory,
                slots
            },
            lastUpdate: admin.firestore.Timestamp.now()
        };

        // update both the person and the object
        await Promise.all([
            admin.firestore().collection("persons").doc(personId).set(newPersonData, {merge: true}),
            admin.firestore().collection("objects").doc(objectId).set(newObjectData, {merge: true})
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
