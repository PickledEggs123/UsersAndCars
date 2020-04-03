/**
 * This is the backend file written using Firebase functions. It is a web server that runs for 10 milliseconds before
 * turning back off. It will greatly reduce cost for API calls that are infrequent.
 */
import * as functions from 'firebase-functions';
import * as admin from "firebase-admin";
import * as express from "express";
import * as cors from "cors";

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

interface IPerson {
    id: string;
    x: number;
    y: number;
    shirtColor: string;
    pantColor: string;
    lastUpdate: string;
    carId: string | null;
}
interface IPersonDatabase {
    id: string;
    x: number;
    y: number;
    shirtColor: string;
    pantColor: string;
    lastUpdate: admin.firestore.Timestamp;
    carId: string | null;
}

/**
 * The direction a car is facing.
 */
enum ECarDirection {
    UP = "UP",
    DOWN = "DOWN",
    LEFT = "LEFT",
    RIGHT = "RIGHT"
}

interface ICar {
    id: string;
    x: number;
    y: number;
    direction: ECarDirection;
    lastUpdate: string;
}

interface ICarDatabase {
    id: string;
    x: number;
    y: number;
    direction: ECarDirection;
    lastUpdate: admin.firestore.Timestamp;
}

const personsApp = express();

// Use CORS to allow any URL to access the API, used to enable Single Page Applications.
personsApp.use(cors({origin: true}));

/**
 * Get a list of persons.
 */
personsApp.get("/", (req: any, res: { json: (arg0: any) => void; }, next: (arg0: any) => any) => {
    (async () => {
        // json response data
        const personsToReturnAsJson = [];
        const carsToReturnAsJson = [];

        // get persons
        {
            // compute date from thirty seconds ago
            const dateNow = admin.firestore.Timestamp.now().toDate();
            const dateThirtySecondsAgo = new Date(dateNow);
            dateThirtySecondsAgo.setSeconds(dateNow.getSeconds() - 30);
            const thirtySecondsAgo = admin.firestore.Timestamp.fromDate(dateThirtySecondsAgo);

            // get a list of all people who have updated within the last thirty seconds
            const querySnapshot = await admin.firestore().collection("persons")
                .where("lastUpdate", ">=", thirtySecondsAgo)
                .get();

            // add to json list
            for (const documentSnapshot of querySnapshot.docs) {
                const data = documentSnapshot.data() as IPersonDatabase;
                personsToReturnAsJson.push({
                    ...data,
                    lastUpdate: data.lastUpdate.toDate().toISOString()
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

        // return both persons and cars since both can move and both are network objects
        res.json({
            persons: personsToReturnAsJson,
            cars: carsToReturnAsJson
        });
    })().catch((err) => next(err));
});

/**
 * Create a new person.
 */
personsApp.post("/:id", (req: { params: { id: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const id: string = req.params.id;
        const person: IPersonDatabase = {
            id,
            x: 50,
            y: 150,
            pantColor: "blue",
            shirtColor: "grey",
            carId: null,
            lastUpdate: admin.firestore.Timestamp.now()
        };
        await admin.firestore().collection("persons").doc(id).set(person);
        res.sendStatus(200);
    })().catch((err) => next(err));
});

/**
 * Update a person.
 */
personsApp.put("/:id", (req: { params: { id: any; }; body: any; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const id: string = req.params.id;
        const person: IPersonDatabase = {
            id,
            x: 50,
            y: 150,
            pantColor: "blue",
            shirtColor: "grey",
            ...req.body,
            lastUpdate: req.body.lastUpdate ? admin.firestore.Timestamp.fromDate(new Date(req.body.lastUpdate)) : admin.firestore.Timestamp.now()
        };
        await admin.firestore().collection("persons").doc(id).set(person);
        res.sendStatus(200);
    })().catch((err) => next(err));
});

/**
 * Update a person.
 */
personsApp.put("/cars/:id", (req: { params: { id: any; }; body: any; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const id: string = req.params.id;
        const person: ICar = {
            id,
            direction: ECarDirection.DOWN,
            x: 50,
            y: 150,
            ...req.body,
            lastUpdate: req.body.lastUpdate ? admin.firestore.Timestamp.fromDate(new Date(req.body.lastUpdate)) : admin.firestore.Timestamp.now()
        };
        await admin.firestore().collection("personalCars").doc(id).set(person);
        res.sendStatus(200);
    })().catch((err) => next(err));
});

/**
 * Delete a person.
 */
personsApp.delete("/:id", (req: { params: { id: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const {id} = req.params;
        await admin.firestore().collection("persons").doc(id).delete();
        res.sendStatus(200);
    })().catch((err) => next(err));
});

// export the express app as a firebase function
export const persons = functions.https.onRequest(personsApp);
