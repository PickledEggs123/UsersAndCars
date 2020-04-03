/**
 * The base interface for all game objects.
 */
export interface IObject {
    /**
     * The left to right position of the object in the game world.
     */
    x: number;
    /**
     * The top to bottom position of the object in the game world.
     */
    y: number;
}

export interface INetworkObject extends IObject {
    /**
     * The randomly generated unique id of the person. Each person has a unique id for selecting and controlling them.
     */
    id: string;
    /**
     * When the person was last updated. Used to keep track of which version of the person data is more up to date. The
     * local copy sometimes can be more up to date than the network copy, so the network copy has to be modified with
     * local data. If the person moves, they will send their current position to the server. They will continue moving,
     * making the sent position out of date. The server will confirm the position update then send back the old position.
     * This field allows the game to reject old copies of position, favoring the newer local position. Without this, the
     * person will teleport backwards, causing a constant teleport backwards glitch.
     */
    lastUpdate: string;
}

/**
 * The base interface for all people in the game.
 */
export interface IPerson extends INetworkObject {
    /**
     * The customizable shirt color of the person.
     */
    shirtColor: string;
    /**
     * The customizable pant color of the person.
     */
    pantColor: string;
    /**
     * The car the person is currently in.
     */
    carId: string | null;
}

/**
 * The type of [[IDrawable object]].
 */
export enum EDrawableType {
    /**
     * When rendering people, people are drawn on top of objects at the same screen height.
     */
    PERSON = "PERSON",
    /**
     * The [[IDrawable]] is a normal object.
     */
    OBJECT = "OBJECT"
}

/**
 * The type of wall to be drawn.
 */
export enum ERoomWallType {
    WALL = "WALL",
    DOOR = "DOOR",
    OPEN = "OPEN"
}

/**
 * The state of the doors in a room.
 */
export interface IRoomDoors {
    /**
     * There is a left door.
     */
    left: ERoomWallType;
    /**
     * There is a right door.
     */
    right: ERoomWallType;
    /**
     * There is a top door.
     */
    top: ERoomWallType;
    /**
     * There is a bottom door.
     */
    bottom: ERoomWallType;
}

/**
 * A room which contains doors and furniture.
 */
export interface IRoom extends IObject {
    /**
     * Unique id of the room.
     */
    id: string;
    /**
     * The doors of the room.
     */
    doors: IRoomDoors;
    /**
     * The chairs in the room.
     */
    chairs: IObject[];
    /**
     * The tables in the room.
     */
    tables: IObject[];
}

/**
 * The direction a car is facing.
 */
export enum ECarDirection {
    UP = "UP",
    DOWN = "DOWN",
    LEFT = "LEFT",
    RIGHT = "RIGHT"
}

/**
 * A car that can contain people who can drive around.
 */
export interface ICar extends INetworkObject {
    /**
     * The direction the car is facing.
     */
    direction: ECarDirection;
}

/**
 * An object which can be sorted for rendering a scene. It can be a person, a chair, a table, or walls. Each [[IDrawable]]
 * is then sorted by height so [[IDrawable]]s on the bottom of the screen will overlap the [[IDrawable]]s above them.
 * This gives the appearance of a 2D Stereographic Projection using overlapped images.
 */
export interface IDrawable extends IObject {
    /**
     * A function that renders the drawable object.
     */
    draw(this: IDrawable): void;

    /**
     * The type of drawable. [[EDrawableType.PERSON]] and [[EDrawableType.OBJECT]] are sorted differently before drawing.
     */
    type: EDrawableType;
}

/**
 * A key down interval handler. Pressing a key down will begin a setInterval which will run every 100 milliseconds. This
 * creates a smooth animation of movement. A person will move 10 pixels every 100 milliseconds until the key up event.
 */
export interface IKeyDownHandler {
    /**
     * The key that triggered the handler. Used by the key up handler to cancel [[interval]] then to remove the [[IKeyDownHandler]].
     */
    key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "w" | "a" | "s" | "d";
    /**
     * The setTimeout interval which performs the movement or action at a steady rate.
     */
    interval: any;
}

/**
 * The HTTP GET /persons response.
 */
export interface IApiPersonsGet {
    /**
     * A list of people.
     */
    persons: IPerson[];
    /**
     * A list of cars.
     */
    cars: ICar[];
}

/**
 * The login method.
 */
export interface IApiPersonsPost {
    /**
     * The id of the person to login as.
     */
    id: string;
    /**
     * The password of the person to login as.
     */
    password: string;
}

/**
 * The HTTP PUT /persons response.
 */
export interface IApiPersonsPut {
    /**
     * A list of people.
     */
    persons: IPerson[];
    /**
     * A list of cars.
     */
    cars: ICar[];
}

/**
 * A list of game tutorials that should be shown.
 */
export interface IGameTutorials {
    /**
     * If the walking tutorial should be shown.
     */
    walking: {
        /**
         * Was the W key pressed yet.
         */
        w: boolean;
        /**
         * Was the A key pressed yet.
         */
        a: boolean;
        /**
         * Was the S key pressed yet.
         */
        s: boolean;
        /**
         * Was the D key pressed yet.
         */
        d: boolean;
    };
    /**
     * If the driving tutorial should be shown.
     */
    driving: boolean;
}