import {
    ECarDirection,
    ELotZone,
    ENetworkObjectType, IInventoryState,
    ILot,
    INetworkObject, INetworkObjectState, INpcJob,
    INpcPathPoint, INpcSchedule,
    IObjectHealth, IOwner, IResource, IResourceSpawn
} from "persons-game-common/lib/types/GameTypes";
import * as admin from "firebase-admin";
import * as seedrandom from "seedrandom";

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

/**
 * Used to filter by cells as the NPC travel along a path.
 */
export interface INpcCellTimeDatabase {
    /**
     * The id of the NPC.
     */
    npcId: string;
    /**
     * The start time of the NPC being in a cell.
     */
    startTime: admin.firestore.Timestamp;
    /**
     * The end time of the NPC being in a cell.
     */
    endTime: admin.firestore.Timestamp;
    /**
     * The cell the NPC is in.
     */
    cell: string;
    /**
     * If the time cell has expired.
     */
    expired: boolean;
}

/**
 * Person API
 * The following code implement CRUD, Create, Read, (Update missing), Destroy for all car objects using firebase functions
 * to process JSON REST API calls that update a firebase firestore database. The nice feature of using firebase functions
 * is that you pay per invocation or each time the api is called instead of a constant 24/7 uptime. You can break even
 * if you use the API for less than 12 hours out of a 24 hour day.
 */

/**
 * An object that should be networked in multiplayer.
 */
export interface INetworkObjectBaseDatabase {
    id: string;
    x: number;
    y: number;
    objectType: ENetworkObjectType;
    lastUpdate: admin.firestore.Timestamp;
    health: IObjectHealth;
    cell: string;
}

export interface INetworkObjectDatabase extends INetworkObjectBaseDatabase {
    insideStockpile: string | null;
    grabbedByPersonId: string | null;
    grabbedByNpcId: string | null;
    isInInventory: boolean;
    amount: number;
    exist: boolean;
    state: INetworkObjectState<INetworkObject>[];
}

/**
 * The intermediate world cell type.
 */
export interface INetworkObjectCellPosition {
    /**
     * X axis cell number.
     */
    x: number;
    /**
     * Y axis cell number.
     */
    y: number;
}

export interface IPersonsInventoryDatabase {
    rows: number;
    columns: number;
    slots: INetworkObjectDatabase[];
}

export interface IPersonDatabase extends INetworkObjectBaseDatabase {
    shirtColor: string;
    pantColor: string;
    carId: string | null;
    password: string;
    objectType: ENetworkObjectType.PERSON;
    cash: number;
    creditLimit: number;
    inventory: IPersonsInventoryDatabase;
    craftingSeed: string;
    craftingState: seedrandom.State | true;
}

export interface INpcDatabase extends IPersonDatabase {
    path: INpcPathPoint[];
    readyTime: admin.firestore.Timestamp;
    /**
     * A list of actions to perform every 4 hours.
     */
    schedule: INpcSchedule[];
    inventoryState: IInventoryState[];
    job: INpcJob;
}

export interface ICarDatabase extends INetworkObjectBaseDatabase {
    direction: ECarDirection;
    objectType: ENetworkObjectType;
}

export interface IResourceDatabase extends INetworkObjectBaseDatabase {
    spawnSeed: string;
    spawns: IResourceSpawn[];
    spawnState: seedrandom.State | true;
    depleted: boolean;
    readyTime: admin.firestore.Timestamp;
    state: INetworkObjectState<IResource>[];
}

/**
 * Houses provide a location for NPCs to store things, work from, and sleep.
 */
export interface IHouseDatabase extends INetworkObjectBaseDatabase, IOwner {
    /**
     * The npc id of the NPC that lives in the house.
     */
    npcId: string;
}

/**
 * A stockpile object inside the database.
 */
export interface IStockpileDatabase extends INetworkObjectBaseDatabase, IOwner {
    /**
     * The inventory of the stockpile.
     */
    inventory: IPersonsInventoryDatabase;
    /**
     * The stockpile is object type stockpile.
     */
    objectType: ENetworkObjectType.STOCKPILE;
    /**
     * A seed used to generate random crafting ids.
     */
    craftingSeed: string;
    /**
     * The state of the random number generator used to generate new item ids.
     */
    craftingState: true | seedrandom.State;
    /**
     * Represent the change to npc inventory over time.
     */
    inventoryState: IInventoryState[];
}

/**
 * A stockpile tile object inside the database.
 */
export interface IStockpileTileDatabase extends INetworkObjectBaseDatabase, IOwner {
    /**
     * The id of the stockpile the stockpile tile is related to.
     */
    stockpileId: string;
    /**
     * The index into the stockpile inventory. Used to render slices of the stockpile.
     */
    stockpileIndex: number;
}