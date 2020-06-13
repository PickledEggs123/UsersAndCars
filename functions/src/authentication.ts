import {ENetworkObjectType, IApiPersonsLoginPost} from "persons-game-common/lib/types/GameTypes";
import * as admin from "firebase-admin";
import {IPersonDatabase} from "./types/database";
import {defaultPersonHealthObject} from "./config";
import {getNetworkObjectCellString} from "./cell";

/**
 * Handle the login of a user.
 * @param req
 * @param res
 * @param next
 */
export const handleLogin = (req: { body: IApiPersonsLoginPost; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const { statusCode } = await admin.firestore().runTransaction(async (transaction): Promise<{
            statusCode: number
        }> => {
            // check to see if person exists in the database
            const {id, password} = req.body;
            const person = await transaction.get(admin.firestore().collection("persons").doc(id));
            if (person.exists) {
                // person exist, check if logged in already
                const data = person.data() as IPersonDatabase;
                if (data.lastUpdate < getThirtySecondsAgo()) {
                    // the person is not logged in, check password
                    if (data.password === password) {
                        // update lastUpdate to login, keep original position
                        transaction.update(person.ref, {
                            carId: null,
                            lastUpdate: admin.firestore.Timestamp.now()
                        } as Partial<IPersonDatabase>);

                        // return accepted
                        return { statusCode: 202 };
                    } else {
                        // incorrect password, reject
                        return { statusCode: 401 };
                    }
                } else {
                    // the person is logged in, do nothing
                    return { statusCode: 200 };
                }
            } else {
                // person does not exist, create a new login
                const data: IPersonDatabase = {
                    id,
                    password,
                    x: 50,
                    y: 150,
                    pantColor: "blue",
                    shirtColor: "grey",
                    carId: null,
                    lastUpdate: admin.firestore.Timestamp.now(),
                    cash: 1000,
                    creditLimit: 1000,
                    objectType: ENetworkObjectType.PERSON,
                    health: defaultPersonHealthObject,
                    cell: getNetworkObjectCellString({
                        x: 50,
                        y: 150
                    }),
                    inventory: {
                        rows: 1,
                        columns: 10,
                        slots: []
                    },
                    craftingSeed: new Array(20).fill(0).map(() => Math.floor(Math.random() * 36).toString(36)).join(""),
                    craftingState: true,
                };
                transaction.set(admin.firestore().collection("persons").doc(id), data);
            }

            // return created
            return { statusCode: 201 };
        });

        res.sendStatus(statusCode);
    })().catch((err) => next(err));
};
/**
 * Compute the date from thirty seconds ago. Used for determining if tha user is logged in. If the last update was less
 * than 30 seconds ago, they are logged in. If it was greater than 30 seconds, they are logged out.
 */
export const getThirtySecondsAgo = (): admin.firestore.Timestamp => {
    const dateNow = admin.firestore.Timestamp.now().toDate();
    const dateThirtySecondsAgo = new Date(dateNow);
    dateThirtySecondsAgo.setSeconds(dateNow.getSeconds() - 30);
    return admin.firestore.Timestamp.fromDate(dateThirtySecondsAgo);
};