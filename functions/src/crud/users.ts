// https://firebase.google.com/docs/functions/typescript
import * as express from "express";
import * as functions from "firebase-functions";
import * as cors from "cors";
import * as admin from "firebase-admin";

/**
 * User API
 * The following code implement CRUD, Create, Read, (Update missing), Destroy for all car objects using firebase functions
 * to process JSON REST API calls that update a firebase firestore database. The nice feature of using firebase functions
 * is that you pay per invocation or each time the api is called instead of a constant 24/7 uptime. You can break even
 * if you use the API for less than 12 hours out of a 24 hour day.
 */
export const usersApp = express();

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