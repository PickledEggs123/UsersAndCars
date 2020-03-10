import * as functions from 'firebase-functions';
import * as admin from "firebase-admin";
import * as express from "express";
import * as cors from "cors";

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

usersApp.use(cors({origin: true}));

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

usersApp.post("/", (req: { body: { firstName: any; lastName: any; age: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const {firstName, lastName, age} = req.body;
        const user = {firstName, lastName, age};
        await admin.firestore().collection("users").add(user);
        res.sendStatus(200);
    })().catch((err) => next(err));
});

usersApp.delete("/:id", (req: { params: { id: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const {id} = req.params;
        await admin.firestore().collection("users").doc(id).delete();
        res.sendStatus(200);
    })().catch((err) => next(err));
});

export const users = functions.https.onRequest(usersApp);

/**
 * Car API
 * The following code implement CRUD, Create, Read, (Update missing), Destroy for all car objects using firebase functions
 * to process JSON REST API calls that update a firebase firestore database. The nice feature of using firebase functions
 * is that you pay per invocation or each time the api is called instead of a constant 24/7 uptime. You can break even
 * if you use the API for less than 12 hours out of a 24 hour day.
 */
const carsApp = express();

carsApp.use(cors({origin: true}));

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

carsApp.post("/", (req: { body: { make: any; model: any; vin: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const {make, model, vin} = req.body;
        const car = {make, model, vin};
        await admin.firestore().collection("cars").add(car);
        res.sendStatus(200);
    })().catch((err) => next(err));
});

carsApp.delete("/:id", (req: { params: { id: any; }; }, res: any, next: (arg0: any) => any) => {
    (async () => {
        const {id} = req.params;
        await admin.firestore().collection("cars").doc(id).delete();
        res.sendStatus(200);
    })().catch((err) => next(err));
});

export const cars = functions.https.onRequest(carsApp);
