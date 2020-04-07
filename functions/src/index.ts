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
    IApiPersonsGet,
    IApiPersonsLoginPost,
    IApiPersonsPut,
    IApiPersonsVendPost,
    ICar,
    INetworkObject,
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
}

interface ICarDatabase {
    id: string;
    x: number;
    y: number;
    direction: ECarDirection;
    lastUpdate: admin.firestore.Timestamp;
    grabbedByPersonId: string | null;
    objectType: ENetworkObjectType;
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
}

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
 * Get a list of persons.
 */
personsApp.get("/data", (req: any, res: { json: (arg0: any) => void; }, next: (arg0: any) => any) => {
    (async () => {
        // json response data
        const personsToReturnAsJson = [];
        const carsToReturnAsJson = [];
        const objectsToReturnAsJson = [];

        // get persons
        {
            // get a list of all people who have updated within the last thirty seconds
            const querySnapshot = await admin.firestore().collection("persons")
                .where("lastUpdate", ">=", getThirtySecondsAgo())
                .get();

            // add to json list
            for (const documentSnapshot of querySnapshot.docs) {
                const data = documentSnapshot.data() as IPersonDatabase;

                // delete password so it does not reach the frontend
                const dataWithoutPassword = {...data};
                delete dataWithoutPassword.password;

                // save database record into json array
                personsToReturnAsJson.push({
                    ...dataWithoutPassword,
                    lastUpdate: dataWithoutPassword.lastUpdate.toDate().toISOString()
                } as IPerson);
            }
        }

        // get cars
        {
            const querySnapshot = await admin.firestore().collection("personalCars").get();

            for (const documentSnapshot of querySnapshot.docs) {
                const data = documentSnapshot.data() as ICarDatabase;
                carsToReturnAsJson.push({
                    ...data,
                    lastUpdate: data.lastUpdate.toDate().toISOString()
                } as ICar);
            }
        }

        // get objects
        {
            const querySnapshot = await admin.firestore().collection("objects").get();

            for (const documentSnapshot of querySnapshot.docs) {
                const data = documentSnapshot.data() as INetworkObjectDatabase;
                objectsToReturnAsJson.push({
                    ...data,
                    lastUpdate: data.lastUpdate.toDate().toISOString()
                } as INetworkObject);
            }
        }

        // return both persons and cars since both can move and both are network objects
        const jsonData: IApiPersonsGet = {
            persons: personsToReturnAsJson,
            cars: carsToReturnAsJson,
            objects: objectsToReturnAsJson
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
                objectType: ENetworkObjectType.PERSON
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
                        direction: ECarDirection.RIGHT
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
                        objectType
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
                objectType: ENetworkObjectType.PERSON
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
                objectType: ENetworkObjectType.CAR
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

// every minute, run a tick to update all persons
export const personsTick = functions.pubsub.schedule("every 1 minutes").onRun(() => {
    // give every person cash
    return (async () => {
        const personsQuery = await admin.firestore().collection("persons").get();
        for (const personDocument of personsQuery.docs) {
            const data = personDocument.data() as IPerson;
            const cash = data.cash;
            if (typeof cash === "number") {
                await personDocument.ref.set({cash: cash + 100}, {merge: true});
            } else {
                await personDocument.ref.set({cash: 1000}, {merge: true});
            }
        }
    })().catch((err) => {
        throw err;
    });
});
