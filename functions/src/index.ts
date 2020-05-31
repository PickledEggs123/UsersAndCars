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
    ENetworkObjectType,
    IApiLotsBuyPost,
    IApiLotsSellPost,
    IApiPersonsGetResponse,
    IApiPersonsPut,
    ICar,
    IFloor,
    IHouse,
    ILot,
    INetworkObject,
    INpc,
    IPerson,
    IResource,
    IRoad,
    IWall
} from "persons-game-common/lib/types/GameTypes";
import {
    getVoiceMessages,
    handleVoiceMessageAnswer,
    handleVoiceMessageCandidate,
    handleVoiceMessageOffer
} from "./voiceMessages";
import {
    ICarDatabase, IHouseDatabase,
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
import {handleGenerateTerrainTile, handleHarvestResource, updateTerrain} from "./terrain";
import {handleCraftObject, handleDropObject, handlePickUpObject} from "./inventory";
import {getSimpleCollection, sortNetworkObjectsByDistance} from "./common";
import {handleConstructionRequest} from "./construction";
import {simulateCell} from "./pathfinding";

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
            personsToReturnAsJson.sort(sortNetworkObjectsByDistance(currentPersonData));
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
                    delete dataWithoutPassword.schedule;

                    // save database record into json array
                    const npcToReturnAsJson: INpc = {
                        ...dataWithoutPassword,
                        lastUpdate: dataWithoutPassword.lastUpdate ?
                            dataWithoutPassword.lastUpdate.toDate().toISOString() :
                            new Date().toISOString(),
                        readyTime: dataWithoutPassword.readyTime ?
                            dataWithoutPassword.readyTime.toDate().toISOString() :
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
            npcsToReturnAsJson.sort(sortNetworkObjectsByDistance(currentPersonData));
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
            lotsToReturnAsJson.sort(sortNetworkObjectsByDistance(currentPersonData));
        }

        // return both persons and cars since both can move and both are network objects
        const jsonData: IApiPersonsGetResponse = {
            persons: personsToReturnAsJson,
            npcs: npcsToReturnAsJson,
            lots: lotsToReturnAsJson,
            cars: await getSimpleCollection<ICar>(currentPersonData, "personalCars"),
            objects: await getSimpleCollection<INetworkObject>(currentPersonData, "objects"),
            roads: await getSimpleCollection<IRoad>(currentPersonData, "roads"),
            houses: await getSimpleCollection<IHouse>(currentPersonData, "houses"),
            floors: await getSimpleCollection<IFloor>(currentPersonData, "floors"),
            walls: await getSimpleCollection<IWall>(currentPersonData, "walls"),
            resources: await getSimpleCollection<IResource>(currentPersonData, "resources"),
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
 * Construct a building using inventory items.
 */
personsApp.post("/construction", handleConstructionRequest);

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
 * Handle each NPC in the game.
 */
const performNpcTick = async () => {
    // get cellStrings from houses
    const houseDocuments = await admin.firestore().collection("houses").get();
    const cellStrings = Array.from(new Set(houseDocuments.docs.map((houseDocument): string => {
        const houseData = houseDocument.data() as IHouseDatabase;
        return houseData.cell;
    })));

    // generate a NPC for each house
    const pubSubClient = new PubSub();
    await Promise.all(cellStrings.map(cellString => {
        const data = Buffer.from(JSON.stringify({cellString}));
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

        res.sendStatus(200);
    })().catch((err) => next(err));
});
generateApp.post("/npcs", (req, res, next) => {
    (async () => {
        // delete previous npc data
        await deleteAllFromCollection("npcs");
        await deleteAllFromCollection("npcTimes");

        await performNpcTick();

        res.sendStatus(200);
    })().catch((err) => next(err));
});
generateApp.post("/npcs/:cellString", (req, res, next) => {
    (async () => {
        const cellString = req.params.cellString;

        // delete previous npc data
        await deleteAllFromCollection("npcs");
        await deleteAllFromCollection("npcTimes");

        // generate a NPC for each house
        await simulateCell(cellString, 10 * 60 * 1000);

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
    const cellString = message.json.cellString;
    return simulateCell(cellString, 60 * 1000);
});

// handle the terrain generation using a pubsub topic
export const generateTerrain = functions.pubsub.topic("generateTerrain").onPublish((message) => {
    const terrainTile = message.json.terrainTile;
    return handleGenerateTerrainTile(terrainTile);
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
        //await performNpcTick();
    })().catch((err) => {
        throw err;
    });
});
