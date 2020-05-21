/**
 * This is the backend file written using Firebase functions. It is a web server that runs for 10 milliseconds before
 * turning back off. It will greatly reduce cost for API calls that are infrequent.
 */
import * as functions from 'firebase-functions';
import * as admin from "firebase-admin";
import {PubSub} from "@google-cloud/pubsub/build/src";
import * as express from "express";
import * as cors from "cors";
import {users as usersHttp} from "./crud/users";
import {cars as carsHttp} from "./crud/cars";
import {
    ELotZone,
    ENetworkObjectType, IApiLotsBuyPost, IApiLotsSellPost,
    IApiPersonsGetResponse,
    IApiPersonsPut,
    ICar, ILot,
    INetworkObject,
    INpc, INpcSchedule,
    IObject,
    IPerson, IResource, IRoad, IRoom, TDayNightTimeHour
} from "persons-game-common/lib/types/GameTypes";
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
import {getNetworkObjectCellString, getRelevantNetworkObjectCells} from "./cell";
import {getThirtySecondsAgo, handleLogin} from "./authentication";
import {generateCityMapWithRooms, getDirectionMap, getLots, streetWalkerPath} from "./pathfinding";
import {handleGenerateTerrainTile, handleHarvestResource, updateTerrain} from "./terrain";
import {handleCraftObject, handleDropObject, handlePickUpObject} from "./inventory";

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
        const lotsToReturnAsJson: ILot[] = [];

        const {id} = req.query as {id: string};

        if (!id) {
            res.status(404).json({message: "require id parameter"});
            return;
        }

        // get current person, render data relative to current person's position
        const currentPerson = await admin.firestore().collection("persons").doc(id).get();
        const currentPersonData = currentPerson.exists ?
            currentPerson.data() as IPersonDatabase :
            {id, x: 0, y: 0} as IPersonDatabase;

        // begin terrain update
        await updateTerrain({currentPerson: currentPersonData});

        /**
         * The distance from the object to the current person.
         * @param networkObject The object to compute distance for.
         */
        const distanceFromCurrentPerson = (networkObject: IObject): number => {
            return Math.sqrt((networkObject.x - currentPersonData.x) ** 2 + (networkObject.y - currentPersonData.y) ** 2);
        };

        /**
         * Sort network objects by distance from player from nearest to farthest.
         * @param a Object to sort.
         * @param b Object to sort.
         */
        const sortNetworkObjectsByDistance = (a: IObject, b: IObject): number => {
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
                    lastUpdate: dataWithoutPassword.lastUpdate ?
                        dataWithoutPassword.lastUpdate.toDate().toISOString() :
                        new Date().toISOString(),
                    inventory: {
                        ...dataWithoutPassword.inventory,
                        slots: dataWithoutPassword.inventory.slots.map(slot => ({
                            ...slot,
                            lastUpdate: slot.lastUpdate.toDate().toISOString()
                        }))
                    }
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
                .where("expired", "==", false)
                .get();

            // set old time cells expired
            const expiredTimeCells = querySnapshot.docs.filter(document => {
                // select time cells that ended before now
                const data = document.data() as INpcCellTimeDatabase;
                return +new Date() >= data.endTime.toMillis();
            });
            // update time cells by setting expired to true
            await Promise.all(expiredTimeCells.map(timeCell => {
                const data: Partial<INpcCellTimeDatabase> = {
                    expired: true
                };
                return timeCell.ref.set(data, {merge: true});
            }));

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
                // for npcs that exist
                if (documentSnapshot.exists) {
                    // get npc data
                    const data = documentSnapshot.data() as INpcDatabase;

                    // delete password so it does not reach the frontend
                    const dataWithoutPassword = {...data};
                    delete dataWithoutPassword.password;
                    delete dataWithoutPassword.doneWalking;
                    delete dataWithoutPassword.schedule;

                    // save database record into json array
                    const npcToReturnAsJson: INpc = {
                        ...dataWithoutPassword,
                        lastUpdate: dataWithoutPassword.lastUpdate ?
                            dataWithoutPassword.lastUpdate.toDate().toISOString() :
                            new Date().toISOString(),
                        inventory: {
                            ...dataWithoutPassword.inventory,
                            slots: dataWithoutPassword.inventory.slots.map(slot => ({
                                ...slot,
                                lastUpdate: slot.lastUpdate.toDate().toISOString()
                            }))
                        }
                    };
                    npcsToReturnAsJson.push(npcToReturnAsJson);
                }
            }

            // get sorted list of nearest persons
            npcsToReturnAsJson.sort(sortNetworkObjectsByDistance);
        }

        // get lots
        {
            const querySnapshot = await admin.firestore().collection("lots")
                .where("cells", "array-contains-any", getRelevantNetworkObjectCells(currentPersonData))
                .get();

            for (const documentSnapshot of querySnapshot.docs) {
                const data = documentSnapshot.data() as ILot;
                let dataToReturnAsJson: ILot = {
                    ...data
                };

                const buyOffersQuery = await admin.firestore().collection("buyOffers")
                    .where("lotId", "==", data.id)
                    .get();
                const buyOffers: IApiLotsBuyPost[] = buyOffersQuery.docs.map(offer => offer.data() as IApiLotsBuyPost);

                const sellOffersQuery = await admin.firestore().collection("sellOffers")
                    .where("lotId", "==", data.id)
                    .get();
                const sellOffers: IApiLotsSellPost[] = sellOffersQuery.docs.map(offer => offer.data() as IApiLotsSellPost);

                dataToReturnAsJson = {
                    ...dataToReturnAsJson,
                    buyOffers,
                    sellOffers
                };

                lotsToReturnAsJson.push(dataToReturnAsJson);
            }

            // get sorted list of nearest cars
            lotsToReturnAsJson.sort(sortNetworkObjectsByDistance);
        }

        /**
         * Get all objects near person from a collection
         * @param collectionName The name of the collection.
         * @param cellsArray If the collection uses cells string array instead of cell string.
         */
        const getSimpleCollection = async <T extends IObject>(collectionName: string, cellsArray: boolean = false): Promise<Array<T>> => {
            const dataArrayToReturnAsJson: T[] = [];

            // list of objects near the person
            let queryNotInInventory: admin.firestore.Query;
            // list of objects in the person's inventory
            let queryIsInInventory: admin.firestore.Query;
            if (cellsArray) {
                // using cells array, perform a search in an array of cells
                // used for objects that can be in multiple cells like lots. Lots can be larger than cellSize.
                queryNotInInventory = admin.firestore().collection(collectionName)
                    .where("cells", "array-contains-any", getRelevantNetworkObjectCells(currentPersonData))
                    .where("isInInventory", "==", false);
                queryIsInInventory = admin.firestore().collection(collectionName)
                    .where("grabbedByPersonId", "==", currentPersonData ? currentPersonData.id : "")
                    .where("isInInventory", "==", true);
            } else {
                // using cell field, perform a search for a cell field
                // used for objects that are in one cell at a time. The objects are smaller than cellSize.
                queryNotInInventory = admin.firestore().collection(collectionName)
                    .where("cell", "in", getRelevantNetworkObjectCells(currentPersonData))
                    .where("isInInventory", "==", false);
                queryIsInInventory = admin.firestore().collection(collectionName)
                    .where("grabbedByPersonId", "==", currentPersonData ? currentPersonData.id : "")
                    .where("isInInventory", "==", true);
            }
            const querySnapshots = await Promise.all([
                queryNotInInventory.get(),
                queryIsInInventory.get()
            ]);

            for (const querySnapshot of querySnapshots) {
                for (const documentSnapshot of querySnapshot.docs) {
                    const data = documentSnapshot.data() as any;
                    const dataToReturnAsJson: T = {
                        ...data,
                        lastUpdate: data.lastUpdate ?
                            typeof data.lastUpdate === "string" ?
                                data.lastUpdate :
                                data.lastUpdate.toDate().toISOString()
                            : undefined,
                        readyTime: data.readyTime ?
                            typeof data.readyTime === "string" ?
                                data.readyTime :
                                data.readyTime.toDate().toISOString()
                            : undefined
                    };
                    dataArrayToReturnAsJson.push(dataToReturnAsJson);
                }
            }

            // get sorted list of nearest cars
            dataArrayToReturnAsJson.sort(sortNetworkObjectsByDistance);

            return dataArrayToReturnAsJson;
        };

        // return both persons and cars since both can move and both are network objects
        const jsonData: IApiPersonsGetResponse = {
            persons: personsToReturnAsJson,
            npcs: npcsToReturnAsJson,
            lots: lotsToReturnAsJson,
            cars: await getSimpleCollection<ICar>("personalCars"),
            objects: await getSimpleCollection<INetworkObject>("objects"),
            roads: await getSimpleCollection<IRoad>("roads"),
            rooms: await getSimpleCollection<IRoom>("rooms"),
            resources: await getSimpleCollection<IResource>("resources"),
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
 * Harvest a resource.
 */
personsApp.post("/resource/harvest", handleHarvestResource);

/**
 * Pick an object up into the inventory.
 */
personsApp.post("/object/pickup", handlePickUpObject);

/**
 * Drop an object from the inventory.
 */
personsApp.post("/object/drop", handleDropObject);

/**
 * Craft an object in the inventory
 */
personsApp.post("/object/craft", handleCraftObject);

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
                ...personWithoutSensitiveInformation,
                inventory: {
                    ...personWithoutSensitiveInformation.inventory,
                    slots: personWithoutSensitiveInformation.inventory.slots.map(slot => ({
                        ...slot,
                        lastUpdate: admin.firestore.Timestamp.fromMillis(Date.parse(slot.lastUpdate)),
                        cell: getNetworkObjectCellString(slot)
                    }))
                },
                // convert ISO string date into firebase firestore Timestamp
                lastUpdate: person.lastUpdate ? admin.firestore.Timestamp.fromDate(new Date(person.lastUpdate)) : admin.firestore.Timestamp.now(),
                objectType: ENetworkObjectType.PERSON,
                cell: getNetworkObjectCellString({
                    ...personWithoutSensitiveInformation
                })
            };
        });
        const carsToSaveIntoDatabase = req.body.cars.map((car: ICar): Partial<ICarDatabase> => {
            return {
                ...car,
                // convert ISO string date into firebase firestore Timestamp
                lastUpdate: car.lastUpdate ? admin.firestore.Timestamp.fromDate(new Date(car.lastUpdate)) : admin.firestore.Timestamp.now(),
                objectType: ENetworkObjectType.CAR,
                cell: getNetworkObjectCellString({
                    ...car
                })
            };
        });
        const objectsToSaveIntoDatabase = req.body.objects.map((networkObject: INetworkObject): Partial<INetworkObjectDatabase> => {
            return {
                ...networkObject,
                // convert ISO string date into firebase firestore Timestamp
                lastUpdate: networkObject.lastUpdate ? admin.firestore.Timestamp.fromDate(new Date(networkObject.lastUpdate)) : admin.firestore.Timestamp.now(),
                cell: getNetworkObjectCellString({
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
 * Generate a schedule for the NPC to follow.
 */
const generateNpcSchedule = async (): Promise<INpcSchedule[]> => {
    const schedule: INpcSchedule[] = [];

    // get a list of residential and commercial lots
    const lotData = await getLots();
    const residentialLots = lotData.filter(lot => lot.zone === ELotZone.RESIDENTIAL);
    const commercialLots = lotData.filter(lot => lot.zone === ELotZone.COMMERCIAL);

    // get the home of the NPC
    const home = residentialLots[Math.floor(Math.random() * residentialLots.length)];
    // get three stores for the NPC to visit
    const stores = new Array(3).fill(0).map(() => {
        return commercialLots[Math.floor(Math.random() * commercialLots.length)];
    });

    // if home and each store exist, make a schedule
    if (home && stores.every(store => store)) {
        // npcs start at home
        schedule.push({
            startTime: 0,
            endTime: TDayNightTimeHour * 7,
            to: {
                x: home.x,
                y: home.y
            }
        });

        // they travel to a store for 1 hour (10 minutes) then return for 2 hours
        stores.forEach((store, i) => {
            schedule.push({
                startTime: TDayNightTimeHour * (7 + i * 3),
                endTime: TDayNightTimeHour * (8 + i * 3),
                to: {
                    x: store.x,
                    y: store.y
                }
            });
            schedule.push({
                startTime: TDayNightTimeHour * (8 + i * 3),
                endTime: TDayNightTimeHour * (10 + i * 3),
                to: {
                    x: home.x,
                    y: home.y
                }
            });
        });

        // go home and sleep
        schedule.push({
            startTime: TDayNightTimeHour * 16,
            endTime: TDayNightTimeHour * 24,
            to: {
                x: home.x,
                y: home.y
            }
        });
    }
    return schedule;
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
            grabbedByNpcId: null,
            isInInventory: false,
            cash: 1000,
            creditLimit: 0,
            objectType: ENetworkObjectType.PERSON,
            lastUpdate: admin.firestore.Timestamp.now(),
            doneWalking: admin.firestore.Timestamp.now(),
            password: "",
            health: defaultPersonHealthObject,
            path: [],
            schedule: await generateNpcSchedule(),
            directionMap: "",
            cell: "",
            inventory: {
                rows: 1,
                columns: 10,
                slots: []
            },
            amount: 1,
            craftingSeed: new Array(20).fill(0).map(() => Math.floor(Math.random() * 36).toString(36)).join(""),
            craftingState: true
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
 * Delete a large collection of documents using pagination.
 * @param collectionName The collection name to delete.
 */
const deleteAllFromCollection = async (collectionName: string) => {
    // the previous document in the query, used for pagination large collections of more than 100 documents
    let previousDocumentSnapshot: admin.firestore.DocumentSnapshot | undefined = undefined;
    while (true) {
        // paginate 100 documents, starting off from the previous document
        const documentQuery = admin.firestore().collection(collectionName)
            .limit(100);
        if (previousDocumentSnapshot) {
            documentQuery.startAfter(previousDocumentSnapshot);
        }

        // get documents
        const documents = await documentQuery.get();
        if (documents.docs.length === 0) {
            // no more documents, stop deletion
            break;
        }

        // delete documents
        await Promise.all(documents.docs.map(doc => doc.ref.delete()));

        // store a copy of the last previous document to continue pagination
        previousDocumentSnapshot = documents.docs[documents.docs.length - 1];
    }
};

/**
 * Generate data.
 */
const generateApp = express();
generateApp.use(cors({origin: true}));
generateApp.post("/city", (req, res, next) => {
    (async () => {
        // delete old city data
        await Promise.all([
            deleteAllFromCollection("roads"),
            deleteAllFromCollection("lots"),
            deleteAllFromCollection("rooms"),
            deleteAllFromCollection("cityMaps")
        ]);

        // create new city data
        await generateCityMapWithRooms();

        res.sendStatus(200);
    })().catch((err) => next(err));
});
generateApp.post("/npcs", (req, res, next) => {
    (async () => {
        // delete previous npc data
        await deleteAllFromCollection("npcs");
        await deleteAllFromCollection("npcTimes");

        // generate 200 npcs
        const pubSubClient = new PubSub();
        const npcIds = new Array(50).fill(0).map((v, i) => `npc-${i}`);
        await Promise.all(npcIds.map(id => {
            const data = Buffer.from(JSON.stringify({id}));
            return pubSubClient.topic("npc").publish(data);
        }));

        res.sendStatus(200);
    })().catch((err) => next(err));
});
generateApp.post("/terrain", (req, res, next) => {
    (async () => {
        // delete resources and terrain tiles so they can be regenerated
        await deleteAllFromCollection("resources");
        await deleteAllFromCollection("terrainTiles");
        res.sendStatus(200);
    })().catch((err) => next(err));
});
export const generate = functions.https.onRequest(generateApp);

/**
 * Lot data.
 */
const lotsApp = express();
const acceptBuyOffer = async (offer: IApiLotsBuyPost) => {
    const lotDocument = await admin.firestore().collection("lots").doc(offer.lotId).get();
    const personDocument = await admin.firestore().collection("persons").doc(offer.personId).get();
    if (lotDocument.exists && personDocument.exists) {
        const oldBuyOffers = await admin.firestore().collection("buyOffers")
            .where("lotId", "==", offer.lotId)
            .get();
        const oldSellOffers = await admin.firestore().collection("sellOffers")
            .where("lotId", "==", offer.lotId)
            .get();

        const lotData: Partial<ILot> = {
            owner: offer.personId
        };
        const personData = personDocument.data() as IPersonDatabase;
        const newPersonData: Partial<IPersonDatabase> = {
            cash: personData.cash - offer.price,
            lastUpdate: admin.firestore.Timestamp.now()
        };
        await Promise.all([
            lotDocument.ref.set(lotData, {merge: true}),
            personDocument.ref.set(newPersonData, {merge: true}),
            ...oldBuyOffers.docs.map(o => o.ref.delete()),
            ...oldSellOffers.docs.map(o => o.ref.delete())
        ]);
    }
};
lotsApp.use(cors({origin: true}));
lotsApp.post("/buy", (req, res, next) => {
    (async () => {
        const bodyData: IApiLotsBuyPost = req.body;

        // find lot in database
        const lotDocument = await admin.firestore().collection("lots").doc(bodyData.lotId).get();
        if (lotDocument.exists) {
            // lot exists, get data
            const lotData = lotDocument.data() as ILot;

            if (!lotData.owner) {
                // lot has no owner, automatically accept offer
                await acceptBuyOffer(bodyData);
            } else {
                // lot has an owner, create a buy offer
                await admin.firestore().collection("buyOffers").add({
                    ...req.body
                });
            }
        }

        res.sendStatus(200);
    })().catch((err) => next(err));
});
// accept a buy offer
lotsApp.post("/buy/accept", (req, res, next) => {
    (async () => {
        const bodyData: IApiLotsBuyPost = req.body;
        await acceptBuyOffer(bodyData);
        res.sendStatus(200);
    })().catch((err) => next(err));
});
// accept a buy offer
lotsApp.post("/sell/accept", (req, res, next) => {
    (async () => {
        const bodyData: IApiLotsBuyPost = req.body;
        await acceptBuyOffer(bodyData);
        res.sendStatus(200);
    })().catch((err) => next(err));
});
lotsApp.post("/sell", (req, res, next) => {
    (async () => {
        await admin.firestore().collection("sellOffers").add({
            ...req.body
        });

        res.sendStatus(200);
    })().catch((err) => next(err));
});
export const lots = functions.https.onRequest(lotsApp);

// handle the npc using a pubsub topic
export const npcTick = functions.pubsub.topic("npc").onPublish((message) => {
    const id = message.json.id;
    return handleStreetWalkingNpc({id});
});

// handle the terrain generation using a pubsub topic
export const generateTerrain = functions.pubsub.topic("generateTerrain").onPublish((message) => {
    const terrainTile = message.json.terrainTile;
    return handleGenerateTerrainTile(terrainTile);
});

// generate a direction map for a location
export const generateDirectionMap = functions.pubsub.topic("directionMaps").onPublish((message) => {
    const to = message.json.to;
    return getDirectionMap(to);
});

// every minute, run a tick to update all persons
export const personsTick = functions.pubsub.schedule("every 1 minutes").onRun(() => {
    return (async () => {
        await giveEveryoneCash();

        // health regeneration or object depreciation
        await performHealthTickOnCollectionOfNetworkObjects("persons", defaultPersonHealthObject);
        await performHealthTickOnCollectionOfNetworkObjects("personalCars", defaultCarHealthObject);
        await performHealthTickOnCollectionOfNetworkObjects("objects", defaultObjectHealthObject);

        // handle each npc
        await performNpcTick();
    })().catch((err) => {
        throw err;
    });
});
