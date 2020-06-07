import * as admin from "firebase-admin";
import {ECarDirection, ENetworkObjectType, IApiPersonsVendPost, IPerson} from "persons-game-common/lib/types/GameTypes";
import {ICarDatabase, INetworkObjectDatabase, IPersonDatabase} from "./types/database";
import {defaultCarHealthObject, defaultObjectHealthObject} from "./config";
import {getNetworkObjectCellString} from "./cell";

/**
 * This file handles all cash transaction. This includes paying and buying.
 */

/**
 * Give every person cash.
 */
export const giveEveryoneCash = async () => {
    const personsQuery = await admin.firestore().collection("persons").get();
    for (const personDocument of personsQuery.docs) {
        const data = personDocument.data() as IPerson;
        const cash = data.cash;
        if (typeof cash === "number") {
            const newData: Partial<IPersonDatabase> = {
                cash: cash + 100
            };
            await personDocument.ref.set(newData, {merge: true});
        } else {
            const newData: Partial<IPersonDatabase> = {
                cash: 1000
            };
            await personDocument.ref.set(newData, {merge: true});
        }
    }
};

/**
 * Handle the purchase of an item.
 * @param req
 * @param res
 * @param next
 */
export const handleVend = (req: { body: IApiPersonsVendPost; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        // check to see if person exists in the database
        const {price, objectType, personId} = req.body;

        const person = await admin.firestore().collection("persons").doc(personId).get();
        if (person.exists) {
            const personData = person.data() as IPersonDatabase;
            const cash = personData.cash || 0;
            const credit = personData.creditLimit || 0;
            const x = personData.x || 50;
            const y = personData.y || 150;

            // enough money to buy
            if (cash - price >= -credit) {
                // object does not exist, create it
                const id = new Array(10).fill(0).map(() => Math.round(36 * Math.random()).toString(36)).join("");
                if (objectType === ENetworkObjectType.CAR) {
                    const car: ICarDatabase = {
                        id,
                        x,
                        y,
                        lastUpdate: admin.firestore.Timestamp.now(),
                        objectType,
                        direction: ECarDirection.RIGHT,
                        health: defaultCarHealthObject,
                        cell: getNetworkObjectCellString({
                            x,
                            y
                        }),
                    };

                    // update two database objects
                    await Promise.all([
                        // subtract person's money
                        person.ref.set({
                            cash: cash - price,
                            lastUpdate: admin.firestore.Timestamp.now()
                        }, {merge: true}),
                        // create object
                        admin.firestore().collection("personalCars").doc(id).set(car)
                    ]);

                    // return created
                    res.sendStatus(201);
                } else {
                    const data: INetworkObjectDatabase = {
                        id,
                        x,
                        y,
                        insideStockpile: null,
                        grabbedByPersonId: null,
                        grabbedByNpcId: null,
                        isInInventory: false,
                        lastUpdate: admin.firestore.Timestamp.now(),
                        objectType,
                        health: defaultObjectHealthObject,
                        cell: getNetworkObjectCellString({
                            x,
                            y
                        }),
                        amount: 1,
                        exist: true,
                        state: []
                    };

                    // update two database objects
                    await Promise.all([
                        // subtract person's money
                        person.ref.set({
                            cash: cash - price,
                            lastUpdate: admin.firestore.Timestamp.now()
                        }, {merge: true}),
                        // create object
                        admin.firestore().collection("objects").doc(id).set(data)
                    ]);

                    // return created
                    res.sendStatus(201);
                }
            } else {
                res.status(401).json({
                    message: "Not enough cash to buy this item."
                } as any);
            }
        } else {
            res.status(404).json({
                message: "No user found to buy item."
            } as any);
        }
    })().catch((err) => next(err));
};