import * as express from "express";
import * as functions from "firebase-functions";
import * as cors from "cors";
import * as admin from "firebase-admin";

/**
 * Car API
 * The following code implement CRUD, Create, Read, (Update missing), Destroy for all car objects using firebase functions
 * to process JSON REST API calls that update a firebase firestore database. The nice feature of using firebase functions
 * is that you pay per invocation or each time the api is called instead of a constant 24/7 uptime. You can break even
 * if you use the API for less than 12 hours out of a 24 hour day.
 */
export const carsApp = express();

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