/**
 * This is the backend file written using Firebase functions. It is a web server that runs for 10 milliseconds before
 * turning back off. It will greatly reduce cost for API calls that are infrequent.
 */
import * as functions from 'firebase-functions';
import * as admin from "firebase-admin";
import {PubSub} from "@google-cloud/pubsub";
import * as express from "express";
import * as cors from "cors";
import {users as usersHttp} from "./crud/users";
import {cars as carsHttp} from "./crud/cars";
import {
    ECarDirection,
    ENetworkObjectType,
    IApiPersonsGetResponse,
    IApiPersonsPut,
    ICar,
    INetworkObject,
    INpc, IObject,
    IPerson
} from "./types/GameTypes";
import {
    getVoiceMessages,
    handleVoiceMessageAnswer,
    handleVoiceMessageCandidate,
    handleVoiceMessageOffer
} from "./voiceMessages";
import {
    ICarDatabase,
    INetworkObjectDatabase,
    INpcCellTimeDatabase,
    INpcDatabase,
    IPersonDatabase
} from "./types/database";
import {defaultCarHealthObject, defaultObjectHealthObject, defaultPersonHealthObject} from "./config";
import {giveEveryoneCash, handleVend} from "./cash";
import {performHealthTickOnCollectionOfNetworkObjects} from "./health";
import {addCellStringToBlankCellObjects, getNetworkObjectCellString, getRelevantNetworkObjectCells} from "./cell";
import {getThirtySecondsAgo, handleLogin} from "./authentication";
import {getCityMapWithRooms, getDirectionMap, streetWalkerPath} from "./pathfinding";

const matchAll = require("string.prototype.matchall");
matchAll.shim();

/**
 * Initialize the firebase API.
 */
admin.initializeApp();

export const users = usersHttp;
export const cars = carsHttp;

const personsApp = express();

// Use CORS to allow any URL to access the API, used to enable Single Page Applications.
personsApp.use(cors({origin: true}));

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
                    lastUpdate: dataWithoutPassword.lastUpdate ? dataWithoutPassword.lastUpdate.toDate().toISOString() : new Date().toISOString()
                };
                personsToReturnAsJson.push(personToReturnAsJson);
            }

            // get sorted list of nearest persons
            personsToReturnAsJson.sort(sortNetworkObjectsByDistance);
        }

        // get npcs
        {
            // get a list of traveling npcs nearby the current person
            // must use a separate collection with npc schedule to gather traveling npcs
            // more complicated query involving one npc to many time and cell records
            const querySnapshot = await admin.firestore().collection("npcTimes")
                .where("startTime", "<=", admin.firestore.Timestamp.now())
                .where("cell", "in", getRelevantNetworkObjectCells(currentPersonData))
                .get();

            // get npc ids
            const npcIds = [...new Set(querySnapshot.docs.map(document => {
                return document.data() as INpcCellTimeDatabase;
            }).filter(data => +new Date() < data.endTime.toMillis()) // only dates that have not happened yet
                .map((data) => data.npcId))];

            // concurrently fetch documents
            const documents = await Promise.all(npcIds.map(npcId => {
                return admin.firestore().collection("npcs").doc(npcId).get();
            }));

            // add to json list
            for (const documentSnapshot of documents) {
                const data = documentSnapshot.data() as INpcDatabase;

                // delete password so it does not reach the frontend
                const dataWithoutPassword = {...data};
                delete dataWithoutPassword.password;
                delete dataWithoutPassword.doneWalking;

                // save database record into json array
                const npcToReturnAsJson: INpc = {
                    ...dataWithoutPassword,
                    lastUpdate: dataWithoutPassword.lastUpdate ? dataWithoutPassword.lastUpdate.toDate().toISOString() : new Date().toISOString()
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

        // return both persons and cars since both can move and both are network objects
        const jsonData: IApiPersonsGetResponse = {
            persons: personsToReturnAsJson,
            npcs: npcsToReturnAsJson,
            cars: carsToReturnAsJson,
            objects: objectsToReturnAsJson,
            voiceMessages: await getVoiceMessages(id)
        };
        res.json(jsonData);
    })().catch((err) => next(err));
});

/**
 * The login method.
 */
personsApp.post("/login", handleLogin);

/**
 * The vend method.
 */
personsApp.post("/vend", handleVend);

/**
 * Add a WebRTC ICE candidate message for another user.
 */
personsApp.post("/voice/candidate", handleVoiceMessageCandidate);

/**
 * Add a WebRTC offer message for another user.
 */
personsApp.post("/voice/offer", handleVoiceMessageOffer);

/**
 * Add a WebRTC answer message for another user.
 */
personsApp.post("/voice/answer", handleVoiceMessageAnswer);

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
            let data: INpcDatabase = {
                ...applyPathToNpc(npcData)
            };
            const streetWalkerData = await streetWalkerPath(applyPathToNpc(npcData), {x: 0, y: 0});
            data = {
                ...data,
                doneWalking: streetWalkerData.doneWalking,
                path: streetWalkerData.path,
                directionMap: streetWalkerData.directionMap
            };

            // collect old cell times, must remove them
            const oldCellTimes = await admin.firestore().collection("npcTimes")
                .where("npcId", "==", npc.id)
                .get();
            await Promise.all([
                // update npc with path
                npc.ref.set(data, {merge: true}),
                // remove old cell times
                ...oldCellTimes.docs.map((queryDocumentSnapshot): Promise<any> => {
                    return queryDocumentSnapshot.ref.delete();
                }),
                // add new cell times
                ...streetWalkerData.cellTimes.map((cellTime): Promise<any> => {
                    return admin.firestore().collection("npcTimes").add(cellTime);
                })
            ]);
        }
    } else {
        // npc does not exist, create one from scratch
        let data: INpcDatabase = {
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
            doneWalking: admin.firestore.Timestamp.now(),
            password: "",
            health: defaultPersonHealthObject,
            path: [],
            directionMap: ""
        };
        const streetWalkerData = await streetWalkerPath(data, {x: 0, y: 0});
        data = {
            ...data,
            doneWalking: streetWalkerData.doneWalking,
            path: streetWalkerData.path,
            directionMap: streetWalkerData.directionMap
        };

        // collect old cell times, must remove them
        const oldCellTimes = await admin.firestore().collection("npcTimes")
            .where("npcId", "==", npc.id)
            .get();
        await Promise.all([
            // update npc with path
            npc.ref.set(data),
            // remove old cell times
            ...oldCellTimes.docs.map((queryDocumentSnapshot): Promise<any> => {
                return queryDocumentSnapshot.ref.delete();
            }),
            // add new cell times
            ...streetWalkerData.cellTimes.map((cellTime): Promise<any> => {
                return admin.firestore().collection("npcTimes").add(cellTime);
            })
        ]);
    }
};

/**
 * Handle each NPC in the game.
 */
const performNpcTick = async () => {
    // get a list of npcIds of npcs that are done walking
    const npcDocuments = await admin.firestore().collection("npcs")
        .where("doneWalking", "<=", admin.firestore.Timestamp.now())
        .get();
    const npcIds = npcDocuments.docs.map(doc => doc.id);

    // update only the npcs that are done walking
    // each npc uses a pubsub topic so each npc is simulated by a separate CPU.
    const pubSubClient = new PubSub();
    await Promise.all(npcIds.map((id) => {
        const data = Buffer.from(JSON.stringify({id}));
        return pubSubClient.topic("npc").publish(data);
    }));
};

/**
 * Refresh all npcs on the server.
 */
const npcsApp = express();
npcsApp.use(cors({origin: true}));
npcsApp.post("/refresh", (req, res, next) => {
    (async () => {
        // delete previous npcs
        while (true) {
            const npcDocs = await admin.firestore().collection("npcs")
                .limit(100)
                .get();
            if (npcDocs.docs.length === 0) {
                break;
            }
            await Promise.all(npcDocs.docs.map(doc => doc.ref.delete()));
        }
        // delete previous npc times
        while (true) {
            const npcTimeDocs = await admin.firestore().collection("npcTimes")
                .limit(100)
                .get();
            if (npcTimeDocs.docs.length === 0) {
                break;
            }
            await Promise.all(npcTimeDocs.docs.map(doc => doc.ref.delete()));
        }

        // generate 200 npcs
        const pubSubClient = new PubSub();
        const npcIds = new Array(200).fill(0).map((v, i) => `npc-${i}`);
        await Promise.all(npcIds.map(id => {
            const data = Buffer.from(JSON.stringify({id}));
            return pubSubClient.topic("npc").publish(data);
        }));

        res.sendStatus(200);
    })().catch((err) => next(err));
});
export const npcs = functions.https.onRequest(npcsApp);

// handle the npc using a pubsub topic
export const npcTick = functions.pubsub.topic("npc").onPublish((message) => {
    const id = message.json.id;
    return handleStreetWalkingNpc({id});
});

// generate a direction map for a location
export const generateDirectionMap = functions.pubsub.topic("directionMaps").onPublish((message) => {
    const to = message.json.to;
    return getDirectionMap(to);
});

/**
 * A direction map item used to determine which direction maps to create.
 */
interface IDirectionMapItem extends IObject {
    id: string;
}

/**
 * Generate all possible direction maps once to speed up NPC path finding.
 */
const generateDirectionMaps = async () => {
    // get direction maps that already exist
    const directionMapSnapshots = await admin.firestore().collection("directionMaps").get();
    const directionMapIdsThatExist = directionMapSnapshots.docs.map(doc => doc.id);

    // get direction maps that should exist given the city map
    const cityMapWithRooms = await getCityMapWithRooms();
    const directionMapsIdsThatShouldExist = cityMapWithRooms.split(/\r|\n|\r\n/).reduce((acc: IDirectionMapItem[], row, rowIndex): IDirectionMapItem[] => {
        return [
            ...acc,
            ...row.split("").map((column, columnIndex): IDirectionMapItem => {
                return {
                    id: `city1(${columnIndex},${rowIndex})`,
                    x: columnIndex,
                    y: rowIndex
                };
            })
        ];
    }, []);

    // find a list of direction maps to create (they don't exist yet)
    const directionMapsToCreate = directionMapsIdsThatShouldExist.reduce((acc: IObject[], directionMapItem): IObject[] => {
        if (!directionMapIdsThatExist.includes(directionMapItem.id)) {
            return [
                ...acc,
                {
                    x: directionMapItem.x,
                    y: directionMapItem.y
                }
            ];
        } else {
            return acc;
        }
    }, []);

    // create worker threads to process all direction maps
    const pubSub = new PubSub();
    await Promise.all(directionMapsToCreate.map(to => {
        const data = Buffer.from(JSON.stringify({to}));
        return pubSub.topic("directionMaps").publish(data);
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

        // generate every direction map so NPCs can recycle the previous direction map instead of creating a new one
        // from scratch, map generation can take 3 or 4 seconds per map.
        await generateDirectionMaps();

        // handle each npc
        await performNpcTick();
    })().catch((err) => {
        throw err;
    });
});
