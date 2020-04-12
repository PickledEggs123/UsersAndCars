/**
 * This is the backend file written using Firebase functions. It is a web server that runs for 10 milliseconds before
 * turning back off. It will greatly reduce cost for API calls that are infrequent.
 */
import * as functions from 'firebase-functions';
import * as admin from "firebase-admin";
import * as express from "express";
import * as cors from "cors";
import {
    ECarDirection, ELotExpandType, ELotZone,
    ENetworkObjectType,
    IApiPersonsGetResponse,
    IApiPersonsLoginPost,
    IApiPersonsPut,
    IApiPersonsVendPost,
    IApiPersonsVoiceAnswerMessage,
    IApiPersonsVoiceCandidateMessage,
    IApiPersonsVoiceOfferMessage,
    ICar, ILot, ILotExpandTypeAndAffectedLocations,
    INetworkObject,
    INpc,
    INpcPathPoint,
    IObject,
    IObjectHealth,
    IPerson, IVendor
} from "./types/GameTypes";

export interface ILotFillerLotAndObjects {
    lot: ILot;
    objects: INetworkObject[];
}

/**
 * A list of lot fillers. They fill the lot with a format string given a dimension and zone type.
 */
export interface ILotFiller {
    width: number;
    height: number;
    zone: ELotZone;
    fillLot(lot: ILot): ILotFillerLotAndObjects;
}

const matchAll = require("string.prototype.matchall");
matchAll.shim();

/**
 * Initialize the firebase API.
 */
admin.initializeApp();

// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript
/**
 * User API
 * The following code implement CRUD, Create, Read, (Update missing), Destroy for all car objects using firebase functions
 * to process JSON REST API calls that update a firebase firestore database. The nice feature of using firebase functions
 * is that you pay per invocation or each time the api is called instead of a constant 24/7 uptime. You can break even
 * if you use the API for less than 12 hours out of a 24 hour day.
 */
const usersApp = express();

// use CORS to allow request to come from any domain, Allow the API to be called by Single Page Applications.
usersApp.use(cors({origin: true}));

/**
 * Get a list of users.
 */
usersApp.get("/", (req: any, res: { json: (arg0: any) => void; }, next: (arg0: any) => any) => {
    (async () => {
        const querySnapshot = await admin.firestore().collection("users").get();
        const usersToReturnAsJson = [];

        for (const documentSnapshot of querySnapshot.docs) {
            usersToReturnAsJson.push({
                id: documentSnapshot.id,
                ...documentSnapshot.data()
            });
        }

        res.json(usersToReturnAsJson as any);
    })().catch((err) => next(err));
});

/**
 * Create a new user.
 */
usersApp.post("/", (req: { body: { firstName: any; lastName: any; age: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const {firstName, lastName, age} = req.body;
        const user = {firstName, lastName, age};
        await admin.firestore().collection("users").add(user);
        res.sendStatus(200);
    })().catch((err) => next(err));
});

/**
 * Delete a user.
 */
usersApp.delete("/:id", (req: { params: { id: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const {id} = req.params;
        await admin.firestore().collection("users").doc(id).delete();
        res.sendStatus(200);
    })().catch((err) => next(err));
});

// export the express app as a firebase function.
export const users = functions.https.onRequest(usersApp);

/**
 * Car API
 * The following code implement CRUD, Create, Read, (Update missing), Destroy for all car objects using firebase functions
 * to process JSON REST API calls that update a firebase firestore database. The nice feature of using firebase functions
 * is that you pay per invocation or each time the api is called instead of a constant 24/7 uptime. You can break even
 * if you use the API for less than 12 hours out of a 24 hour day.
 */
const carsApp = express();

// Use CORS to allow any URL to access the API, used to enable Single Page Applications.
carsApp.use(cors({origin: true}));

/**
 * Get a list of cars.
 */
carsApp.get("/", (req: any, res: { json: (arg0: any) => void; }, next: (arg0: any) => any) => {
    (async () => {
        const querySnapshot = await admin.firestore().collection("cars").get();
        const carsToReturnAsJson = [];

        for (const documentSnapshot of querySnapshot.docs) {
            carsToReturnAsJson.push({
                id: documentSnapshot.id,
                ...documentSnapshot.data()
            });
        }

        res.json(carsToReturnAsJson as any);
    })().catch((err) => next(err));
});

/**
 * Create a new car.
 */
carsApp.post("/", (req: { body: { make: any; model: any; vin: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const {make, model, vin} = req.body;
        const car = {make, model, vin};
        await admin.firestore().collection("cars").add(car);
        res.sendStatus(200);
    })().catch((err) => next(err));
});

/**
 * Delete a car.
 */
carsApp.delete("/:id", (req: { params: { id: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const {id} = req.params;
        await admin.firestore().collection("cars").doc(id).delete();
        res.sendStatus(200);
    })().catch((err) => next(err));
});

// export the express app as a firebase function
export const cars = functions.https.onRequest(carsApp);

/**
 * Person API
 * The following code implement CRUD, Create, Read, (Update missing), Destroy for all car objects using firebase functions
 * to process JSON REST API calls that update a firebase firestore database. The nice feature of using firebase functions
 * is that you pay per invocation or each time the api is called instead of a constant 24/7 uptime. You can break even
 * if you use the API for less than 12 hours out of a 24 hour day.
 */

interface IPersonDatabase {
    id: string;
    x: number;
    y: number;
    shirtColor: string;
    pantColor: string;
    lastUpdate: admin.firestore.Timestamp;
    carId: string | null;
    grabbedByPersonId: string | null;
    password: string;
    objectType: ENetworkObjectType;
    cash: number;
    creditLimit: number;
    health: IObjectHealth;
    cell: string;
}

interface INpcDatabase {
    id: string;
    x: number;
    y: number;
    shirtColor: string;
    pantColor: string;
    lastUpdate: admin.firestore.Timestamp;
    carId: string | null;
    grabbedByPersonId: string | null;
    password: string;
    objectType: ENetworkObjectType;
    cash: number;
    creditLimit: number;
    health: IObjectHealth;
    path: INpcPathPoint[];
}

interface ICarDatabase {
    id: string;
    x: number;
    y: number;
    direction: ECarDirection;
    lastUpdate: admin.firestore.Timestamp;
    grabbedByPersonId: string | null;
    objectType: ENetworkObjectType;
    health: IObjectHealth;
    cell: string;
}

/**
 * An object that should be networked in multiplayer.
 */
interface INetworkObjectDatabase {
    id: string;
    x: number;
    y: number;
    objectType: ENetworkObjectType;
    grabbedByPersonId: string | null;
    lastUpdate: admin.firestore.Timestamp;
    health: IObjectHealth;
    cell: string;
}

/**
 * The default value for person health.
 */
const defaultPersonHealthObject: IObjectHealth = {
    max: 10,
    value: 10,
    rate: 1
};

/**
 * The default value for car health.
 */
const defaultCarHealthObject: IObjectHealth = {
    max: 24,
    value: 24,
    // car aging
    rate: -0.002
};

/**
 * The default value for object health.
 */
const defaultObjectHealthObject: IObjectHealth = {
    max: 1,
    value: 1,
    rate: 0
};

const personsApp = express();

// Use CORS to allow any URL to access the API, used to enable Single Page Applications.
personsApp.use(cors({origin: true}));

/**
 * Compute the date from thirty seconds ago. Used for determining if tha user is logged in. If the last update was less
 * than 30 seconds ago, they are logged in. If it was greater than 30 seconds, they are logged out.
 */
const getThirtySecondsAgo = (): admin.firestore.Timestamp => {
    const dateNow = admin.firestore.Timestamp.now().toDate();
    const dateThirtySecondsAgo = new Date(dateNow);
    dateThirtySecondsAgo.setSeconds(dateNow.getSeconds() - 30);
    return admin.firestore.Timestamp.fromDate(dateThirtySecondsAgo);
};

/**
 * The size of each cell in the game world.
 */
const cellSize = 2000;

/**
 * The intermediate world cell type.
 */
interface INetworkObjectCellPosition {
    /**
     * X axis cell number.
     */
    x: number;
    /**
     * Y axis cell number.
     */
    y: number;
}

/**
 * Get the cell tile position of a network object.
 * @param networkObject The object to compute position for.
 */
const getNetworkObjectWorldCellPosition = (networkObject: IObject): INetworkObjectCellPosition => {
    const x = Math.round(networkObject.x / cellSize);
    const y = Math.round(networkObject.y / cellSize);
    return {
        x,
        y
    };
};

/**
 * Get the cell string of a cell position.
 * @param position The cell position to convert into a string.
 */
const networkObjectCellPositionToCellString = (position: INetworkObjectCellPosition): string => {
    return `cell:${position.x},${position.y}`;
};

/**
 * Get the cell string of a network object.
 * @param networkObject The network object to convert into a cell string.
 */
const getNetworkObjectCellString = (networkObject: IObject): string => {
    return networkObjectCellPositionToCellString(getNetworkObjectWorldCellPosition(networkObject));
};

/**
 * Get a list of relevant world cells to filter by.
 * @param networkObject The network object to filter by.
 */
const getRelevantNetworkObjectCells = (networkObject: IObject): string[] => {
    // gt network object world cell position
    const {x, y} = getNetworkObjectWorldCellPosition(networkObject);

    // which corner of the cell is the object nearest to
    const left = networkObject.x <= x * cellSize;
    const top = networkObject.y <= y * cellSize;

    // pick the current cell and the 3 other cells around the nearest corner, return 4 cells
    return [{
        x,
        y
    }, {
        x: left ? x - 1 : x + 1,
        y
    }, {
        x: left ? x - 1 : x + 1,
        y: top ? y - 1 : y + 1
    }, {
        x,
        y: top ? y - 1 : y + 1
    }].map(networkObjectCellPositionToCellString);
};

/**
 * Get a list of persons.
 */
personsApp.get("/data", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        // json response data
        const personsToReturnAsJson: IPerson[] = [];
        const npcsToReturnAsJson: INpc[] = [];
        const carsToReturnAsJson: ICar[] = [];
        const objectsToReturnAsJson: INetworkObject[] = [];
        const candidates: IApiPersonsVoiceCandidateMessage[] = [];
        const offers: IApiPersonsVoiceOfferMessage[] = [];
        const answers: IApiPersonsVoiceAnswerMessage[] = [];

        const {id} = req.query;

        if (!id) {
            res.status(404).json({message: "require id parameter"});
            return;
        }

        // get current person, render data relative to current person's position
        const currentPerson = await admin.firestore().collection("persons").doc(id).get();
        const currentPersonData = currentPerson.exists ? currentPerson.data() as IPersonDatabase : {x: 0, y: 0} as IPersonDatabase;

        /**
         * The distance from the object to the current person.
         * @param networkObject The object to compute distance for.
         */
        const distanceFromCurrentPerson = (networkObject: INetworkObject): number => {
            return Math.sqrt((networkObject.x - currentPersonData.x) ** 2 + (networkObject.y - currentPersonData.y) ** 2);
        };

        /**
         * Sort network objects by distance from player from nearest to farthest.
         * @param a Object to sort.
         * @param b Object to sort.
         */
        const sortNetworkObjectsByDistance = (a: INetworkObject, b: INetworkObject): number => {
            return distanceFromCurrentPerson(a) - distanceFromCurrentPerson(b);
        };

        // get persons
        {
            // get a list of all people who have updated within the last thirty seconds
            const querySnapshot = await admin.firestore().collection("persons")
                .where("lastUpdate", ">=", getThirtySecondsAgo())
                .where("cell", "in", getRelevantNetworkObjectCells(currentPersonData))
                .get();

            // add to json list
            for (const documentSnapshot of querySnapshot.docs) {
                const data = documentSnapshot.data() as IPersonDatabase;

                // delete password so it does not reach the frontend
                const dataWithoutPassword = {...data};
                delete dataWithoutPassword.password;

                // save database record into json array
                const personToReturnAsJson: IPerson = {
                    ...dataWithoutPassword,
                    lastUpdate: dataWithoutPassword.lastUpdate.toDate().toISOString()
                };
                personsToReturnAsJson.push(personToReturnAsJson);
            }

            // get sorted list of nearest persons
            personsToReturnAsJson.sort(sortNetworkObjectsByDistance);
        }

        // get npcs
        {
            // get a list of all people who have updated within the last thirty seconds
            const querySnapshot = await admin.firestore().collection("npcs")
                .get();

            // add to json list
            for (const documentSnapshot of querySnapshot.docs) {
                const data = documentSnapshot.data() as INpcDatabase;

                // delete password so it does not reach the frontend
                const dataWithoutPassword = {...data};
                delete dataWithoutPassword.password;

                // save database record into json array
                const npcToReturnAsJson: INpc = {
                    ...dataWithoutPassword,
                    lastUpdate: dataWithoutPassword.lastUpdate.toDate().toISOString()
                };
                npcsToReturnAsJson.push(npcToReturnAsJson);
            }

            // get sorted list of nearest persons
            npcsToReturnAsJson.sort(sortNetworkObjectsByDistance);
        }

        // get cars
        {
            const querySnapshot = await admin.firestore().collection("personalCars")
                .where("cell", "in", getRelevantNetworkObjectCells(currentPersonData))
                .get();

            for (const documentSnapshot of querySnapshot.docs) {
                const data = documentSnapshot.data() as ICarDatabase;
                const carToReturnAsJson: ICar = {
                    ...data,
                    lastUpdate: data.lastUpdate.toDate().toISOString()
                };
                carsToReturnAsJson.push(carToReturnAsJson);
            }

            // get sorted list of nearest cars
            carsToReturnAsJson.sort(sortNetworkObjectsByDistance);
        }

        // get objects
        {
            const querySnapshot = await admin.firestore().collection("objects")
                .where("cell", "in", getRelevantNetworkObjectCells(currentPersonData))
                .get();

            for (const documentSnapshot of querySnapshot.docs) {
                const data = documentSnapshot.data() as INetworkObjectDatabase;
                const objectToReturnAsJson: INetworkObject = {
                    ...data,
                    lastUpdate: data.lastUpdate.toDate().toISOString()
                };
                objectsToReturnAsJson.push(objectToReturnAsJson);
            }

            // get sorted list of nearest objects
            objectsToReturnAsJson.sort(sortNetworkObjectsByDistance);
        }

        // a list of WebRTC ICE candidates to add
        {
            const querySnapshot = await admin.firestore().collection("voiceCandidates")
                .where("to", "==", id)
                .get();

            for (const documentSnapshot of querySnapshot.docs) {
                const message = documentSnapshot.data() as IApiPersonsVoiceCandidateMessage;

                await documentSnapshot.ref.delete();

                candidates.push(message);
            }
        }

        // list of WebRTC socket descriptions to add
        {
            const querySnapshot = await admin.firestore().collection("voiceOffers")
                .where("to", "==", id)
                .get();

            for (const documentSnapshot of querySnapshot.docs) {
                const message = documentSnapshot.data() as IApiPersonsVoiceOfferMessage;

                await documentSnapshot.ref.delete();

                offers.push(message);
            }
        }

        // list of WebRTC socket descriptions to add
        {
            const querySnapshot = await admin.firestore().collection("voiceAnswers")
                .where("to", "==", id)
                .get();

            for (const documentSnapshot of querySnapshot.docs) {
                const message = documentSnapshot.data() as IApiPersonsVoiceAnswerMessage;

                await documentSnapshot.ref.delete();

                answers.push(message);
            }
        }

        // return both persons and cars since both can move and both are network objects
        const jsonData: IApiPersonsGetResponse = {
            persons: personsToReturnAsJson,
            npcs: npcsToReturnAsJson,
            cars: carsToReturnAsJson,
            objects: objectsToReturnAsJson,
            voiceMessages: {
                candidates,
                offers,
                answers
            }
        };
        res.json(jsonData);
    })().catch((err) => next(err));
});

/**
 * The login method.
 */
personsApp.post("/login", (req: { body: IApiPersonsLoginPost; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        // check to see if person exists in the database
        const {id, password} = req.body;
        const person = await admin.firestore().collection("persons").doc(id).get();
        if (person.exists) {
            // person exist, check if logged in already
            const data = person.data() as IPersonDatabase;
            if (data.lastUpdate < getThirtySecondsAgo()) {
                // the person is not logged in, check password
                if (data.password === password) {
                    // update lastUpdate to login, keep original position
                    await person.ref.update({
                        carId: null,
                        lastUpdate: admin.firestore.Timestamp.now()
                    } as Partial<IPersonDatabase>);

                    // return accepted
                    res.sendStatus(202);
                } else {
                    // incorrect password, reject
                    res.sendStatus(401);
                }
            } else {
                // the person is logged in, do nothing
                res.sendStatus(200);
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
                grabbedByPersonId: null,
                lastUpdate: admin.firestore.Timestamp.now(),
                cash: 1000,
                creditLimit: 1000,
                objectType: ENetworkObjectType.PERSON,
                health: defaultPersonHealthObject,
                cell: getNetworkObjectCellString({
                    x: 50,
                    y: 150
                })
            };
            await admin.firestore().collection("persons").doc(id).set(data);

            // return created
            res.sendStatus(201);
        }
    })().catch((err) => next(err));
});

/**
 * The vend method.
 */
personsApp.post("/vend", (req: { body: IApiPersonsVendPost; }, res: any, next: (arg0: any) => any) => {
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
                        grabbedByPersonId: null,
                        lastUpdate: admin.firestore.Timestamp.now(),
                        objectType,
                        direction: ECarDirection.RIGHT,
                        health: defaultCarHealthObject,
                        cell: getNetworkObjectCellString({
                            x,
                            y
                        })
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
                        grabbedByPersonId: null,
                        lastUpdate: admin.firestore.Timestamp.now(),
                        objectType,
                        health: defaultObjectHealthObject,
                        cell: getNetworkObjectCellString({
                            x,
                            y
                        })
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
});

/**
 * Add a WebRTC ICE candidate message for another user.
 */
personsApp.post("/voice/candidate", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        await admin.firestore().collection("voiceCandidates").add(req.body);
        res.sendStatus(201);
    })().catch((err) => next(err));
});

/**
 * Add a WebRTC offer message for another user.
 */
personsApp.post("/voice/offer", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        await admin.firestore().collection("voiceOffers").add(req.body);
        res.sendStatus(201);
    })().catch((err) => next(err));
});

/**
 * Add a WebRTC answer message for another user.
 */
personsApp.post("/voice/answer", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    (async () => {
        await admin.firestore().collection("voiceAnswers").add(req.body);
        res.sendStatus(201);
    })().catch((err) => next(err));
});

/**
 * Update game state.
 */
personsApp.put("/data", (req: { body: IApiPersonsPut; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        // convert data into database format
        const personsToSaveIntoDatabase = req.body.persons.map((person: IPerson): Partial<IPersonDatabase> => {
            // remove cash and credit limit information from person before updating database
            // do not want the client to set their own cash or credit limit
            const personWithoutSensitiveInformation = {...person};
            delete personWithoutSensitiveInformation.cash;
            delete personWithoutSensitiveInformation.creditLimit;

            return {
                id: person.id,
                x: 50,
                y: 150,
                pantColor: "blue",
                shirtColor: "grey",
                grabbedByPersonId: null,
                ...personWithoutSensitiveInformation,
                // convert ISO string date into firebase firestore Timestamp
                lastUpdate: person.lastUpdate ? admin.firestore.Timestamp.fromDate(new Date(person.lastUpdate)) : admin.firestore.Timestamp.now(),
                objectType: ENetworkObjectType.PERSON,
                cell: getNetworkObjectCellString({
                    x: 50,
                    y: 150,
                    ...personWithoutSensitiveInformation
                })
            };
        });
        const carsToSaveIntoDatabase = req.body.cars.map((car: ICar): Partial<ICarDatabase> => {
            return {
                id: car.id,
                direction: ECarDirection.DOWN,
                x: 50,
                y: 150,
                grabbedByPersonId: null,
                ...car,
                // convert ISO string date into firebase firestore Timestamp
                lastUpdate: car.lastUpdate ? admin.firestore.Timestamp.fromDate(new Date(car.lastUpdate)) : admin.firestore.Timestamp.now(),
                objectType: ENetworkObjectType.CAR,
                cell: getNetworkObjectCellString({
                    x: 50,
                    y: 150,
                    ...car
                })
            };
        });
        const objectsToSaveIntoDatabase = req.body.objects.map((networkObject: INetworkObject): Partial<INetworkObjectDatabase> => {
            return {
                id: networkObject.id,
                x: 50,
                y: 150,
                objectType: ENetworkObjectType.BOX,
                grabbedByPersonId: null,
                ...networkObject,
                // convert ISO string date into firebase firestore Timestamp
                lastUpdate: networkObject.lastUpdate ? admin.firestore.Timestamp.fromDate(new Date(networkObject.lastUpdate)) : admin.firestore.Timestamp.now(),
                cell: getNetworkObjectCellString({
                    x: 50,
                    y: 150,
                    ...networkObject
                })
            };
        });

        // save all data objects to the database simultaneously
        await Promise.all([
            ...personsToSaveIntoDatabase.map((person) => {
                return admin.firestore().collection("persons").doc(person.id as string).set(person, {merge: true});
            }),
            ...carsToSaveIntoDatabase.map((car) => {
                return admin.firestore().collection("personalCars").doc(car.id as string).set(car, {merge: true});
            }),
            ...objectsToSaveIntoDatabase.map((networkObject) => {
                return admin.firestore().collection("objects").doc(networkObject.id as string).set(networkObject, {merge: true});
            })
        ]);

        // end request
        res.sendStatus(200);
    })().catch((err) => next(err));
});

// export the express app as a firebase function
export const persons = functions.https.onRequest(personsApp);

/**
 * Give every person cash.
 */
const giveEveryoneCash = async () => {
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
 * Perform health updates on a database collection of [[INetworkObject]] objects.
 * @param collectionName The name of the collection to update.
 */
const performHealthTickOnCollectionOfNetworkObjects = async (collectionName: string, defaultHealthObject: IObjectHealth) => {
    const collectionQuery = await admin.firestore().collection(collectionName).get();
    for (const doc of collectionQuery.docs) {
        const data = doc.data() as INetworkObjectDatabase;
        // use existing or default health object
        const healthData: IObjectHealth = data.health || defaultHealthObject;
        // compute new health value
        const newValue = Math.max(0, Math.min(healthData.value + healthData.rate, healthData.max));

        // if health object does not exist, or health value changed, or object is dead, update health object
        if (!data.health || newValue !== healthData.value || newValue === 0) {
            if (newValue === 0) {
                // 0 health, death of person or destruction of object
                await doc.ref.delete();
            } else {
                // change person or object health
                const newData: Partial<INetworkObjectDatabase> = {
                    health: {
                        ...healthData,
                        value: newValue
                    }
                };
                await doc.ref.set(newData, {merge: true});
            }
        }
    }
};

/**
 * Add cell string to blank cell objects.
 * @param collectionName The collection to process.
 */
const addCellStringToBlankCellObjects = async (collectionName: string) => {
    const collectionQuery = await admin.firestore().collection(collectionName).get();
    for (const doc of collectionQuery.docs) {
        const data = doc.data() as INetworkObjectDatabase;

        // if object does not have a cell string
        if (!data.cell) {
            // add cell string to object
            const newData: Partial<INetworkObjectDatabase> = {
                cell: getNetworkObjectCellString(data)
            };
            await doc.ref.set(newData, {merge: true});
        }
    }
};

/**
 * Path finding API.
 */


/**
 * Lot is at location and zone matches.
 * @param location The location to check.
 * @param zone The zone of the located lot.
 */
const lotAtLocation = (location: IObject, zone: ELotZone) => (lot: ILot): boolean => {
    return Math.abs(lot.x - location.x) <= 10 && Math.abs(lot.y - location.y) <= 10 && lot.zone === zone;
};

/**
 * Determine the type of lot expansion to perform.
 * @param lot The lot to check.
 * @param lots The lots to expand into.
 */
const getLotExpandTypeAndAffectedLocations = (lot: ILot, lots: ILot[]): ILotExpandTypeAndAffectedLocations => {
    // the tile position of the lot
    const lotXInTiles = Math.round(lot.x / 500);
    const lotYInTiles = Math.round(lot.y / 300);
    // the lot width and height in tiles
    const lotWidthInTiles = Math.round(lot.width / 500);
    const lotHeightInTitles = Math.round(lot.height / 300);

    // a line on the right side of the square, lot can expand into the right row
    const rightLocations = new Array(lotHeightInTitles).fill(0).map((v, i): IObject => ({
        x: (lotXInTiles + lotWidthInTiles) * 500,
        y: (lotYInTiles + i) * 300
    }));
    // a line on the bottom of the square, lot can expand into the bottom row
    const bottomLocations = new Array(lotWidthInTiles).fill(0).map((v, i): IObject => ({
        x: (lotXInTiles + i) * 500,
        y: (lotYInTiles + lotHeightInTitles) * 300
    }));
    // a corner square, lot can expand into both right and bottom if the corner is filled
    const cornerLocation: IObject = {
        x: (lotXInTiles + lotWidthInTiles) * 500,
        y: (lotYInTiles + lotHeightInTitles) * 300
    };

    // determine if positions are filled
    const isRightFilled = rightLocations.every(location => {
        return lots.some(lotAtLocation(location, lot.zone));
    });
    const isBottomFilled = bottomLocations.every(location => {
        return lots.some(lotAtLocation(location, lot.zone));
    });
    const isCornerFilled = lots.some(lotAtLocation(cornerLocation, lot.zone));

    // depending on which tile positions are filled
    if (isRightFilled && isBottomFilled && isCornerFilled) {
        // return bottom and right affected lots
        return {
            lotExpandType: ELotExpandType.RIGHT_AND_BOTTOM,
            affectedLots: [
                ...rightLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                    const l = lots.find(lotAtLocation(location, lot.zone));
                    if (l) {
                        return [...arr, l];
                    } else {
                        return arr;
                    }
                }, []),
                ...bottomLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                    const l = lots.find(lotAtLocation(location, lot.zone));
                    if (l) {
                        return [...arr, l];
                    } else {
                        return arr;
                    }
                }, []),
                ...lots.filter(lotAtLocation(cornerLocation, lot.zone))
            ]
        };
    } else if (isRightFilled) {
        // return right affected lots
        return {
            lotExpandType: ELotExpandType.RIGHT,
            affectedLots: [
                ...rightLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                    const l = lots.find(lotAtLocation(location, lot.zone));
                    if (l) {
                        return [...arr, l];
                    } else {
                        return arr;
                    }
                }, [])
            ]
        };
    } else if (isBottomFilled) {
        // return bottom affected lots
        return {
            lotExpandType: ELotExpandType.BOTTOM,
            affectedLots: [
                ...bottomLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                    const l = lots.find(lotAtLocation(location, lot.zone));
                    if (l) {
                        return [...arr, l];
                    } else {
                        return arr;
                    }
                }, [])
            ]
        };
    } else {
        return {
            lotExpandType: ELotExpandType.NONE,
            affectedLots: []
        };
    }
};

const lotFillers: ILotFiller[] = [{
    width: 2500,
    height: 1200,
    zone: ELotZone.RESIDENTIAL,
    fillLot(lot: ILot): ILotFillerLotAndObjects {
        return {
            lot: {
                ...lot,
                format: "" +
                    "  E  \n" +
                    "OHHO \n" +
                    "OHOH \n" +
                    " E   "
            },
            objects: []
        };
    }
}, {
    width: 2500,
    height: 900,
    zone: ELotZone.RESIDENTIAL,
    fillLot(lot: ILot): ILotFillerLotAndObjects {
        return {
            lot: {
                ...lot,
                format: "" +
                    "OE EO\n" +
                    "HH HH\n" +
                    "OE EO"
            },
            objects: []
        };
    }
}, {
    width: 2500,
    height: 1200,
    zone: ELotZone.COMMERCIAL,
    fillLot(lot: ILot): ILotFillerLotAndObjects {
        return {
            lot: {
                ...lot,
                format: "" +
                    "  E  \n" +
                    "OHHHH\n" +
                    "OHHHH\n" +
                    "  E  "
            },
            objects: [{
                x: lot.x + 1250,
                y: lot.y + 600,
                objectType: ENetworkObjectType.VENDING_MACHINE,
                grabbedByPersonId: null,
                id: `lot-${lot.x}-${lot.y}-vending-machine`,
                lastUpdate: new Date().toISOString(),
                inventory: [{
                    price: 3000,
                    objectType: ENetworkObjectType.CAR
                }, {
                    price: 10,
                    objectType: ENetworkObjectType.BOX
                }]
            } as IVendor] as INetworkObject[]
        };
    }
}, {
    width: 2500,
    height: 900,
    zone: ELotZone.COMMERCIAL,
    fillLot(lot: ILot): ILotFillerLotAndObjects {
        return {
            lot: {
                ...lot,
                format: "" +
                    "  E  \n" +
                    "OHHHO\n" +
                    "  E  "
            },
            objects: []
        };
    }
}];

/**
 * Fill a lot with rooms.
 * @param lot The lot to fill.
 */
const fillLot = (lot: ILot): ILotFillerLotAndObjects => {
    const lotFiller = lotFillers.find(l => l.width === lot.width && l.height === lot.height && l.zone === lot.zone);
    if (lotFiller) {
        return lotFiller.fillLot(lot);
    } else {
        return {
            lot,
            objects: [] as INetworkObject[]
        };
    }
};

/**
 * Generate lots and objects within the lots.
 * @param format The format string of the city. Lots will populate an ASCII map of the city.
 * @param x The x offset of the city.
 * @param y The y offset of the city.
 */
const generateLots = ({format, offset: {x, y}}: {format: string, offset: IObject}): {lots: ILot[], objects: INetworkObject[]} => {
    let lots = [] as ILot[];

    // generate a lot for each zoning character
    const rows = format.split(/\r\n|\r|\n/);
    rows.forEach((row, rowIndex) => {
        const zones = row.split("");
        zones.forEach((zone, columnIndex) => {
            switch (zone) {
                case "R": {
                    const lot: ILot = {
                        owner: null,
                        format: null,
                        width: 500,
                        height: 300,
                        x: x + columnIndex * 500,
                        y: y + rowIndex * 300,
                        zone: ELotZone.RESIDENTIAL
                    };
                    lots.push(lot);
                    break;
                }
                case "C": {
                    const lot: ILot = {
                        owner: null,
                        format: null,
                        width: 500,
                        height: 300,
                        x: x + columnIndex * 500,
                        y: y + rowIndex * 300,
                        zone: ELotZone.COMMERCIAL
                    };
                    lots.push(lot);
                    break;
                }
            }
        });
    });

    // merge lots into their neighbors
    for (const firstLot of lots) {
        let exitLoop = false;
        for (let depth = 1; depth < 5 && !exitLoop; depth++) {
            const {affectedLots, lotExpandType} = getLotExpandTypeAndAffectedLocations(firstLot, lots);
            switch (lotExpandType) {
                case ELotExpandType.RIGHT_AND_BOTTOM: {
                    // expand lot both right and bottom
                    firstLot.width += 500;
                    firstLot.height += 300;
                    break;
                }
                case ELotExpandType.RIGHT: {
                    // expand lot to the right
                    firstLot.width += 500;
                    break;
                }
                case ELotExpandType.BOTTOM: {
                    // expand lot to the bottom
                    firstLot.height += 300;
                    break;
                }
                case ELotExpandType.NONE: {
                    exitLoop = true;
                    break;
                }
            }

            // remove affected lots
            lots = lots.filter(lot => !affectedLots.some(lotAtLocation(lot, firstLot.zone)));
        }
    }

    // generate rooms and objects per lot
    const lotAndObjects = lots.map(fillLot);

    // merge into two lists
    const lotAndObjectsMerge = lotAndObjects.reduce(({lotArr, objectsArr}: {lotArr: ILot[], objectsArr: INetworkObject[]}, lotAndObjectsItem): {lotArr: ILot[], objectsArr: INetworkObject[]} => {
        return {
            lotArr: [...lotArr, lotAndObjectsItem.lot],
            objectsArr: [...objectsArr, ...lotAndObjectsItem.objects]
        };
    }, {
        lotArr: [],
        objectsArr: []
    });
    lots = lotAndObjectsMerge.lotArr;
    const objects = lotAndObjectsMerge.objectsArr;

    return {
        lots,
        objects
    };
};

/**
 * Find the nth regex position in the string.
 * @param format The string to search.
 * @param regex The regex to search.
 * @param nth The number of times the regex occurred.
 */
const findPositionOfNthOccurrence = (format: string, regex: RegExp, nth: number): number => {
    if (nth < 0) {
        return 0;
    } else {
        // @ts-ignore
        const matches = format.matchAll(regex);
        if (matches) {
            const match = Array.from(matches)[nth];
            // @ts-ignore
            if (match && typeof match.index === "number") {
                // @ts-ignore
                return match.index + match.length;
            }
        }
        return -1;
    }
};

/**
 * Create a map of the city where zones are replaced with the rooms in a lot.
 * @param format The format string of the city without rooms.
 * @param offset The offset of the city map.
 * @param lots The lots on the city map that contain room information.
 */
const createCityMapWithRooms = ({format, offset, lots}: {format: string, offset: IObject, lots: ILot[]}): string => {
    let cityMapWithRooms = format;
    for (const lot of lots) {
        // get dimension and position of the lot in tiles
        const xTile = Math.round((lot.x - offset.x) / 500);
        const yTile = Math.round((lot.y - offset.y) / 300) - 1;
        const xWidth = Math.round(lot.width / 500);

        // if there is lot information
        if (lot.format) {
            // for each lot ASCII row
            const rows = lot.format.split(/\r|\n|\r\n/);
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                // insert lot row into city map
                const cityFormatRowStart = findPositionOfNthOccurrence(format, /\r|\n|\r\n/g, yTile + rowIndex);
                cityMapWithRooms = `${cityMapWithRooms.slice(0, cityFormatRowStart + xTile)}${row}${cityMapWithRooms.slice(cityFormatRowStart + xTile + xWidth)}`;
            }
        }
    }

    return cityMapWithRooms;
};

const generateDirectionMapTowardsTile = ({cityMapWithRooms, offset, to}: {
    cityMapWithRooms: string,
    offset: IObject,
    to: IObject
}): string => {
    const newLineRegex = /\r|\n|\r\n/g;

    const rows = cityMapWithRooms.split(newLineRegex);

    // generate weight map
    const weightMap: {
        [key: string]: {
            tile: string;
            weight: number;
            direction: string;
        }
    } = {};
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
            weightMap[`${rowIndex},${columnIndex}`] = {
                tile: row[columnIndex],
                weight: Infinity,
                direction: ""
            };
        }
    }

    /**
     * Tile weights between the edges of two tiles. The first character is the current tile and the second character is
     * the next tile. Tile transitions that are not defined are forbidden.
     */
    const tileWeights: {
        [tile: string]: number
    } = {
        "||": 1,
        "--": 1,
        "|-": 10,
        "-|": 5,
        "| ": 1000,
        "- ": 1000,
        "EE": 20,
        "EH": 20,
        "E ": 1000,
        "HH": 40,
        "HE": 40,
        "HO": 100,
        "OH": 100,
        "  ": 1000,
        " E": 1000,
        " |": 1000,
        " -": 1000
    };

    {
        // mark destination on weight map
        const xTile = Math.round((to.x - offset.x) / 500);
        const yTile = Math.round((to.y - offset.y) / 300);
        const data = weightMap[`${yTile},${xTile}`];
        if (data) {
            data.weight = 0;
            data.direction = "*";
        }
    }

    /**
     * Update the weight and direction of the weight map.
     * @param currentTile The center tile.
     * @param neighborTile The side tile next to the center tile.
     * @param direction The direction arrow from neighborTile to currentTile.
     */
    const updateWeightAndDirection = (currentTile: { tile: string; weight: number; }, neighborTile: { tile: string; weight: number; direction: any; }, direction: any) => {
        if (currentTile && neighborTile) {
            const tileTransitionWeight = tileWeights[`${currentTile.tile}${neighborTile.tile}`] || Infinity;
            const newWeight = currentTile.weight + tileTransitionWeight;
            if (newWeight < neighborTile.weight) {
                neighborTile.weight = newWeight;
                neighborTile.direction = direction;
            }
        }
    };

    // for a number of steps
    const numRows = rows.length;
    const numColumns = rows.reduce((acc: number, row: string): number => {
        return Math.max(acc, row.length);
    }, 0);
    const numSteps = numRows + numColumns;
    for (let step = 0; step < numSteps; step++) {
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
                const data = weightMap[`${rowIndex},${columnIndex}`];
                const dataLeft = weightMap[`${rowIndex},${columnIndex - 1}`];
                const dataRight = weightMap[`${rowIndex},${columnIndex + 1}`];
                const dataTop = weightMap[`${rowIndex - 1},${columnIndex}`];
                const dataBottom = weightMap[`${rowIndex + 1},${columnIndex}`];
                if (data) {
                    updateWeightAndDirection(data, dataLeft, "→");
                    updateWeightAndDirection(data, dataRight, "←");
                    updateWeightAndDirection(data, dataTop, "↓");
                    updateWeightAndDirection(data, dataBottom, "↑");
                }
            }
        }
    }

    // render directionMap into a string
    return rows.map((row, rowIndex) => {
        return row.split("").map((tile, columnIndex) => {
            const data = weightMap[`${rowIndex},${columnIndex}`];
            if (data) {
                return data.direction;
            } else {
                return " ";
            }
        }).join("");
    }).join("\n");
};

/**
 * Generate a path on the direction map from a location to the destination.
 * @param directionMap The direction map used for pathfinding.
 * @param offset The offset of the direction map.
 * @param from The initial location.
 */
const findPathOnDirectionMap = ({directionMap, offset, from}: {
    directionMap: string,
    offset: IObject,
    from: IObject
}): INpcPathPoint[] => {
    /**
     * Get the tile character at the specific point
     * @param x X tile position
     * @param y Y tile position
     */
    const getTile = (x: number, y: number): string | undefined => {
        const rows = directionMap.split(/\r|\n|\r\n/);
        const row = rows[y];
        if (row) {
            const tileCharacter = row[x];
            if (tileCharacter) {
                return tileCharacter;
            }
        }
        return undefined;
    };

    // information about the current position and time, iterated while path is being generated.
    let xTile = Math.round((from.x - offset.x) / 500);
    let yTile = Math.round((from.y - offset.y) / 300);
    let tile: string | undefined = getTile(xTile, yTile);
    let lastTile: string | undefined;
    let timeSinceStart: number = 0;

    const path: INpcPathPoint[] = [];
    const now = new Date();
    const timeVertical = 3000;
    const timeHorizontal = 5000;

    // initial location
    path.push({
        time: now.toISOString(),
        location: from
    });

    let endLoop: boolean = false;
    for (let step = 0; step < 100 && !endLoop; step++) {
        // move and add time to path
        switch (tile) {
            case "↑": {
                yTile -= 1;
                timeSinceStart += timeVertical;
                break;
            }
            case "↓": {
                yTile += 1;
                timeSinceStart += timeVertical;
                break;
            }
            case "←": {
                xTile -= 1;
                timeSinceStart += timeHorizontal;
                break;
            }
            case "→": {
                xTile += 1;
                timeSinceStart += timeHorizontal;
                break;
            }
            default:
            case "*": {
                // last path point stop
                if (lastTile && ["↑", "↓"].includes(lastTile)) {
                    timeSinceStart += timeVertical;
                }
                if (lastTile && ["←", "→"].includes(lastTile)) {
                    timeSinceStart += timeHorizontal;
                }
                endLoop = true;
                break;
            }
        }

        // update last and current tiles
        lastTile = tile;
        tile = getTile(xTile, yTile);

        // if the tile changed, generate a path point for the corner
        if (lastTile && tile !== lastTile) {
            path.push({
                time: new Date(timeSinceStart + +now).toISOString(),
                location: {
                    x: (xTile * 500) + offset.x + 250,
                    y: (yTile * 300) + offset.y + 150
                }
            });
        }
    }

    return path;
};

/**
 * Generate pathfinding data for a single street walker.
 */
const streetWalkerPath = (npc: IObject, offset: IObject) => {
    // an ASCII map of the city
    const format = "" +
        "|-----|---------------|-----|---------------|-----|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|-----|---------------|-----|---------------|-----|\n" +
        "|CCCCC|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|CCCCC|\n" +
        "|CCCCC|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|CCCCC|\n" +
        "|CCCCC|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|CCCCC|\n" +
        "|-----|---------------|-----|---------------|-----|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
        "|-----|---------------|-----|---------------|-----|";

    // create city map with rooms
    const {lots} = generateLots({format, offset});
    const cityMapWithRooms = createCityMapWithRooms({format, offset, lots});

    // pick random destination
    const generateRandomDestination = (): IObject => {
        const cityRows = cityMapWithRooms.split(/\r|\n|\r\n/);
        const randomCityY = Math.floor(Math.random() * cityRows.length);
        const randomCityRow = cityRows[randomCityY];
        const randomCityX = randomCityRow ? Math.floor(Math.random() * randomCityRow.length) : 0;
        return {
            x: randomCityX * 500,
            y: randomCityY * 300
        };
    };
    const to = generateRandomDestination();
    const from = {
        x: npc.x,
        y: npc.y
    };

    // generate path to destination
    const directionMap = generateDirectionMapTowardsTile({cityMapWithRooms, offset, to});
    return {
        directionMap,
        path: findPathOnDirectionMap({directionMap, offset, from})
    };
};

/**
 * Return if the npc is done walking it's path.
 * @param npcData The data of the npc, contains the path data.
 */
const npcDoneWalking = (npcData: INpcDatabase): boolean => {
    // find last path point
    const lastPathPoint = npcData.path[npcData.path.length - 1];
    if (lastPathPoint) {
        // return if the current time is greater than the last path point, end of path reached.
        const now = new Date();
        return +now > Date.parse(lastPathPoint.time);
    } else {
        // no path data, no walking needed to be done, return no more walking.
        return true;
    }
};

/**
 * Interpolate path data onto the npc position.
 * @param npc The npc with path data.
 */
const applyPathToNpc = (npc: INpcDatabase): INpcDatabase => {
    // get the current time, used to interpolate the npc
    const now = new Date();

    // determine if there is path data
    const firstPoint = npc.path[0];
    if (firstPoint && +now > Date.parse(firstPoint.time)) {
        // there is path information and the path started

        // a path is made of an array of points. We want to interpolate two points forming a line segment.
        // find point b in array of points, it's the second point
        const indexOfPointB = npc.path.findIndex(p => Date.parse(p.time) > +now);
        if (indexOfPointB >= 0) {
            // not past last path yet, interpolate point a to point b
            const a = npc.path[indexOfPointB - 1];
            const b = npc.path[indexOfPointB];
            if (a && b) {
                const pointA = a.location;
                const pointB = b.location;
                const timeA = Date.parse(a.time);
                const timeB = Date.parse(b.time);

                const dx = pointB.x - pointA.x;
                const dy = pointB.y - pointA.y;
                const dt = timeB - timeA;
                const t = (+now - timeA) / dt;
                const x = pointA.x + dx * t;
                const y = pointA.y + dy * t;

                return {
                    ...npc,
                    x,
                    y
                };
            } else {
                // missing points a and b
                return npc;
            }
        } else {
            // past last point, path data is over
            const lastPoint = npc.path[npc.path.length - 1];
            if (lastPoint) {
                // draw npc at last location
                const {x, y} = lastPoint.location;
                return {
                    ...npc,
                    x,
                    y
                };
            } else {
                // cannot find last location, return original npc
                return npc;
            }
        }
    } else {
        // no path information, return original npc
        return npc;
    }
};

/**
 * Handle the path generation for a single street walking npc.
 * @param id The id of the npc.
 */
const handleStreetWalkingNpc = async ({id}: {
    id: string,
}) => {
    const npc = await admin.firestore().collection("npcs").doc(id).get();
    if (npc.exists) {
        // npc exist, check to see if the npc will need a new path
        const npcData = npc.data() as INpcDatabase;
        if (npcDoneWalking(npcData)) {
            const data: INpcDatabase = {
                ...applyPathToNpc(npcData),
                ...streetWalkerPath(applyPathToNpc(npcData), {x: 0, y: 0})
            };
            await npc.ref.set(data, {merge: true});
        }
    } else {
        // npc does not exist, create one from scratch
        const data: INpcDatabase = {
            id,
            x: 250,
            y: 150,
            shirtColor: "green",
            pantColor: "brown",
            carId: null,
            grabbedByPersonId: null,
            cash: 1000,
            creditLimit: 0,
            objectType: ENetworkObjectType.PERSON,
            lastUpdate: admin.firestore.Timestamp.now(),
            password: "",
            health: defaultPersonHealthObject,
            ...streetWalkerPath({x: 250, y: 150}, {x: 0, y: 0})
        };
        await npc.ref.set(data);
    }
};

/**
 * Handle each NPC in the game.
 */
const performNpcTick = async () => {
    // generate 30 npcs that walk randomly around the city using the streets over walking through buildings.
    await Promise.all(new Array(100).fill(0).map((v, i) => {
        const id = `1st-street-walker-${i}`;
        return handleStreetWalkingNpc({id});
    }));
};

// every minute, run a tick to update all persons
export const personsTick = functions.pubsub.schedule("every 1 minutes").onRun(() => {
    return (async () => {
        await giveEveryoneCash();

        // health regeneration or object depreciation
        await performHealthTickOnCollectionOfNetworkObjects("persons", defaultPersonHealthObject);
        await performHealthTickOnCollectionOfNetworkObjects("personalCars", defaultCarHealthObject);
        await performHealthTickOnCollectionOfNetworkObjects("objects", defaultObjectHealthObject);

        // add cell string to objects with no cell string
        await addCellStringToBlankCellObjects("persons");
        await addCellStringToBlankCellObjects("personalCars");
        await addCellStringToBlankCellObjects("objects");

        await performNpcTick();
    })().catch((err) => {
        throw err;
    });
});
