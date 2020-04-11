/**
 * This is the backend file written using Firebase functions. It is a web server that runs for 10 milliseconds before
 * turning back off. It will greatly reduce cost for API calls that are infrequent.
 */
import * as functions from 'firebase-functions';
import * as admin from "firebase-admin";
import * as express from "express";
import * as cors from "cors";
import {
    ECarDirection,
    ENetworkObjectType,
    IApiPersonsGetResponse,
    IApiPersonsLoginPost,
    IApiPersonsPut,
    IApiPersonsVendPost,
    IApiPersonsVoiceAnswerMessage,
    IApiPersonsVoiceCandidateMessage,
    IApiPersonsVoiceOfferMessage,
    ICar,
    INetworkObject,
    IObject,
    IObjectHealth,
    IPerson
} from "./types/GameTypes";

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
    })().catch((err) => {
        throw err;
    });
});
