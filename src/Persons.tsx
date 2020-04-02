import React from 'react';
import './App.scss';
import axios from "axios";

/**
 * The input to the [[Persons]] component that changes how the game is rendered.
 */
interface IPersonsProps {}

/**
 * The base interface for all game objects.
 */
interface IObject {
    /**
     * The left to right position of the object in the game world.
     */
    x: number;
    /**
     * The top to bottom position of the object in the game world.
     */
    y: number;
}

/**
 * The base interface for all people in the game.
 */
interface IPerson extends IObject {
    /**
     * The randomly generated unique id of the person. Each person has a unique id for selecting and controlling them.
     */
    id: string;
    /**
     * The customizable shirt color of the person.
     */
    shirtColor: string;
    /**
     * The customizable pant color of the person.
     */
    pantColor: string;
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
 * The type of [[IDrawable object]].
 */
enum EDrawableType {
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
 * The state of the doors in a room.
 */
interface IRoomDoors {
    /**
     * There is a left door.
     */
    left: boolean;
    /**
     * There is a right door.
     */
    right: boolean;
    /**
     * There is a top door.
     */
    top: boolean;
    /**
     * There is a bottom door.
     */
    bottom: boolean;
}

/**
 * A room which contains doors and furniture.
 */
interface IRoom extends IObject {
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
 * An object which can be sorted for rendering a scene. It can be a person, a chair, a table, or walls. Each [[IDrawable]]
 * is then sorted by height so [[IDrawable]]s on the bottom of the screen will overlap the [[IDrawable]]s above them.
 * This gives the appearance of a 2D Stereographic Projection using overlapped images.
 */
interface IDrawable extends IObject {
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
interface IKeyDownHandler {
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
 * The state of the game component. The game state is stored in React so all changes to the game state will update the
 * SVG on the screen.
 */
interface IPersonsState {
    /**
     * A list of persons from the network.
     */
    persons: IPerson[];
    /**
     * A list of rooms in the current building.
     */
    rooms: IRoom[];
    /**
     * The randomly generated ID of the current person shown.
     */
    currentPersonId: string;
    /**
     * The timestamp of the last network update. Used to prevent the backward teleporting glitch when moving. If the
     * local update is newer than the last network update, the local update will replace the network update. This
     * allows the player to move smoothly across the screen without the network update resetting the player's position
     * to a previous position.
     */
    lastUpdate: string;
}

/**
 * A React Component which renders the Persons game.
 */
export class Persons extends React.Component<IPersonsProps, IPersonsState> {
    /**
     * The interval containing the game loop.
     */
    intervalGameLoop: any = null;

    /**
     * Set Intervals that move the user across the screen.
     */
    keyDownHandlers: IKeyDownHandler[] = [];

    /**
     * The game refresh rate. 1000 means 1 second. Decreasing this value will increase how fluid network movement will
     * appear. A low value will also make more HTTP REST API JSON calls. The backend uses firebase functions which charges
     * money per API call.
     */
    gameRefreshSpeed: number = 2000;

    /**
     * The state of the game.
     */
    state = {
        persons: [] as IPerson[],
        rooms: [{
            x: 0,
            y: 0,
            chairs: [
                {x: 200, y: 50},
                {x: 300, y: 50},
                {x: 200, y: 250},
                {x: 300, y: 250}
            ] as IObject[],
            tables: [
                {x: 250, y: 150}
            ] as IObject[],
            doors: {
                left: false,
                right: true,
                top: false,
                bottom: false
            }
        } as IRoom, {
            x: 500,
            y: 0,
            chairs: [] as IObject[],
            tables: [] as IObject[],
            doors: {
                left: true,
                right: true,
                top: true,
                bottom: true
            }
        } as IRoom, {
            x: 1000,
            y: 0,
            chairs: [
                {x: 200, y: 50},
                {x: 300, y: 50},
                {x: 200, y: 250},
                {x: 300, y: 250}
            ] as IObject[],
            tables: [
                {x: 250, y: 150}
            ] as IObject[],
            doors: {
                left: true,
                right: false,
                top: false,
                bottom: false
            }
        } as IRoom] as IRoom[],
        currentPersonId: this.randomPersonId(),
        lastUpdate: new Date().toISOString()
    };

    /**
     * Setup the game.
     */
    componentDidMount(): void {
        this.beginGameLoop();
    }

    /**
     * Stop the game.
     */
    componentWillUnmount(): void {
        this.endGameLoop();
    }

    /**
     * Create a new person in the database.
     */
    createPerson = async () => {
        await axios.post(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${this.state.currentPersonId}`);
    };

    /**
     * Update the person in the database then update the game.
     */
    updatePerson = async () => {
        const currentPerson = this.state.persons.find(person => person.id === this.state.currentPersonId);
        if (currentPerson) {
            // person exist, update the database with the current copy of current person.
            await axios.put(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${this.state.currentPersonId}`, currentPerson);
            // wait for [[state.lastUpdate]] to update after the network call.
            await new Promise((resolve) => {
                this.setState({
                    lastUpdate: new Date().toISOString()
                }, () => {
                    resolve();
                });
            });
        }
    };

    /**
     * Delete the person from the database.
     */
    deletePerson = async () => {
        await axios.delete(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${this.state.currentPersonId}`);
    };

    /**
     * Begin the game loop.
     */
    beginGameLoop = () => {
        // add keyboard events
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);

        // delete all previous persons
        (async () => {
            const response = await axios.get("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons");
            if (response && response.data) {
                const persons = response.data as IPerson[];
                await Promise.all(persons.map(person => {
                    return axios.delete(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${person.id}`);
                }));
            }
        })().then(() => {
            // begin game loop
            this.intervalGameLoop = setTimeout(this.gameLoop, this.gameRefreshSpeed);
        });
    };

    /**
     * End the game loop.
     */
    endGameLoop = () => {
        // remove keyboard events
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);

        // stop game loop
        if (this.intervalGameLoop) {
            clearTimeout(this.intervalGameLoop);
            this.intervalGameLoop = null;
        }

        // delete current person before closing the window
        this.deletePerson();
    };

    /**
     * Update the state of the game.
     */
    gameLoop = async () => {
        // find current person
        let currentPerson = this.state.persons.find(person => person.id === this.state.currentPersonId);
        if (!currentPerson) {
            // person does not exist, create current person
            this.createPerson();
        }

        // update current person
        if (currentPerson && +Date.parse(this.state.lastUpdate) < +Date.parse(currentPerson.lastUpdate)) {
            await this.updatePerson();
            currentPerson = this.state.persons.find(person => person.id === this.state.currentPersonId);
        }

        // get a list of persons from the database
        const response = await axios.get("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons");
        currentPerson = this.state.persons.find(person => person.id === this.state.currentPersonId);
        if (response && response.data) {
            // get persons data from the server
            const serverPersons = response.data as IPerson[];

            // modify server data with local data, pick most up to date version of the data
            const persons = serverPersons.reduce((arr: IPerson[], person: IPerson): IPerson[] => {
                // check to see if the local data is more up to date.
                if (currentPerson && person.id === this.state.currentPersonId && +Date.parse(currentPerson.lastUpdate) > +Date.parse(person.lastUpdate)) {
                    // local data is more up to date, replace server position with local position, to prevent backward moving glitch
                    const {x, y} = currentPerson;
                    return [
                        ...arr,
                        {
                            ...person,
                            x,
                            y
                        }
                    ]
                } else {
                    // server is up to date, no changes
                    return [...arr, person];
                }
            }, []);
            this.setState({
                persons,
                lastUpdate: new Date().toISOString()
            });
        }

        // schedule next game loop
        this.intervalGameLoop = setTimeout(this.gameLoop, this.gameRefreshSpeed);
    };

    /**
     * Detect if the object is a person.
     * @param person The object to detect as a person.
     */
    isPerson = (person: any): person is IPerson => {
        return person && typeof person.id === "string" && typeof person.x === "number" && typeof person.y === "number" &&
            typeof person.shirtColor === "string" && person.pantColor === "string";
    };

    updateCurrentPerson = (update: (person: IPerson) => IPerson): IPerson[] => {
        return this.state.persons.reduce((arr: IPerson[], person: IPerson): IPerson[] => {
            if (person.id === this.state.currentPersonId) {
                return [...arr, {
                    ...update(person),
                    lastUpdate: new Date().toISOString()
                }];
            } else {
                return [...arr, person];
            }
        }, []);
    };

    /**
     * Generic handler that handles any keyboard movement, add update function to determine how to update the object.
     * The code for WASD keys movement is identical except for one line, adding or subtracting x or y.
     * @param event
     */
    handleKeyDownMovement = (event: KeyboardEvent) => (update: (person: IPerson) => IPerson) => {
        this.keyDownHandlers.push({
            key: event.key as any,
            interval: setInterval(() => {
                const persons = this.updateCurrentPerson(update);
                this.setState({persons});
            }, 100)
        });
    };

    /**
     * Handle the movement of the current person across the screen.
     * @param event
     */
    handleKeyDown = (event: KeyboardEvent) => {
        // ignore repeat key down events to prevent multiple key presses being registered.
        if (event.repeat) {
            return;
        }

        // for each key press type
        switch (event.key) {
            case "w":
            case "ArrowUp": {
                this.handleKeyDownMovement(event)((person: IPerson): IPerson => ({
                    ...person,
                    y: person.y - 10
                }));
                break;
            }
            case "s":
            case "ArrowDown": {
                this.handleKeyDownMovement(event)((person: IPerson): IPerson => ({
                    ...person,
                    y: person.y + 10
                }));
                break;
            }
            case "a":
            case "ArrowLeft": {
                this.handleKeyDownMovement(event)((person: IPerson): IPerson => ({
                    ...person,
                    x: person.x - 10
                }));
                break;
            }
            case "d":
            case "ArrowRight": {
                this.handleKeyDownMovement(event)((person: IPerson): IPerson => ({
                    ...person,
                    x: person.x + 10
                }));
                break;
            }
        }
    };

    /**
     * Handle the key up event on the SVG canvas. It cancels the interval that moves the person on the screen.
     * @param event
     */
    handleKeyUp = (event: KeyboardEvent) => {
        // for all handlers
        while (true) {
            // find handler for corresponding key up
            const index = this.keyDownHandlers.findIndex((handler) => {
                return handler.key === event.key
            });
            // if found
            if (index >= 0) {
                // remove using mutable method
                const handlers = this.keyDownHandlers.splice(index, 1);
                // clear all set intervals for each handler
                handlers.forEach(handler => {
                    if (handler.interval) {
                        clearInterval(handler.interval);
                        handler.interval = null;
                    }
                });
            } else {
                // no more handlers, exit loop
                break;
            }
        }
    };

    /**
     * Handle the update of the current person's property.
     * @param update
     */
    updatePersonProperty = (update: (person: IPerson) => IPerson) => {
        const persons = this.updateCurrentPerson(update);
        this.setState({persons});
    };

    /**
     * Handle the person's shirt color. Allow customization of shirt color.
     * @param event
     */
    handleShirtColor = (event: React.ChangeEvent<HTMLSelectElement>) => {
        this.updatePersonProperty((person: IPerson): IPerson => ({
            ...person,
            shirtColor: event.target.value
        }));
    };

    /**
     * Handle the person's pant color. Allow customization of pant color.
     * @param event
     */
    handlePantColor = (event: React.ChangeEvent<HTMLSelectElement>) => {
        this.updatePersonProperty((person: IPerson): IPerson => ({
            ...person,
            pantColor: event.target.value
        }));
    };

    /**
     * Generate a random Person Id to control a specific person on the server.
     */
    randomPersonId() {
        return new Array(10).fill(0).map(() => Number(Math.floor(Math.random() * 36)).toString(36)).join("");
    }

    /**
     * Determine if an object is inside the room.
     * @param position The object to test.
     */
    isInRoom = (position: IObject) => (room: IRoom): boolean => {
        return position.x >= room.x && position.x <= room.x + 500 &&
            position.y >= room.y && position.y <= room.y + 300;
    };

    /**
     * Draw a person as some SVG elements.
     * @param person The person to draw.
     */
    drawPerson = (person: IPerson) => {
        const {x, y} = person;

        // the mask property which will mask the person's body so the bottom half of the person does not appear below a wall
        let mask: string = "";
        // find which room the person is in
        const roomIndex = this.state.rooms.findIndex(this.isInRoom(person));
        if (roomIndex >= 0) {
            // person is in a room, apply the room mask
            mask = `url(#room-${roomIndex})`;
        }

        return (
            <g key={person.id} x="0" y="0" width="500" height="300" mask={mask}>
                <g key={person.id} transform={`translate(${x - 50},${y - 100})`}>
                    <polygon fill="yellow" points="40,10 60,10 60,30 40,30"/>
                    <polygon fill={person.shirtColor} points="20,30 80,30 80,100 20,100"/>
                    <polygon fill={person.pantColor} points="20,100 80,100 80,120 20,120"/>
                    <polygon fill={person.pantColor} points="20,120 40,120 40,200 20,200"/>
                    <polygon fill={person.pantColor} points="80,120 60,120 60,200 80,200"/>
                </g>
            </g>
        );
    };

    /**
     * Draw a table in a room.
     * @param drawable The table to draw.
     * @param room The room the table is in.
     * @param index The index of the table.
     */
    drawTable = (drawable: IObject, room: IObject, index: number) => {
        const {x, y} = drawable;
        return (
            <g key={`table-${index}`} transform={`translate(${x - 100 + room.x},${y - 50 + room.y})`}>
                <polygon fill="brown" points="0,100 200,100 200,0 0,0"/>
            </g>
        );
    };

    /**
     * Draw a chair in a room.
     * @param drawable The chair to draw.
     * @param room The room that contains the chair.
     * @param index The index of the chair in the room.
     */
    drawChair = (drawable: IObject, room: IObject, index: number) => {
        const {x, y} = drawable;
        return (
            <g key={`chair-${index}`} transform={`translate(${x - 50 + room.x},${y - 50 + room.y})`}>
                <polygon fill="brown" points="10,90 20,90 20,10 10,10"/>
                <polygon fill="brown" points="80,90 90,90 90,10 80,10"/>
                <polygon fill="brown" points="40,90 60,90 60,10 40,10"/>
                <polygon fill="brown" points="10,10 90,10 90,20 10,20"/>
                <polygon fill="brown" points="10,50 90,50 90,90 10,90"/>
            </g>
        );
    };

    /**
     * Draw walls around the room.
     * @param drawable The room to draw walls for.
     * @param index The index of the room.
     */
    drawRoomWalls = (drawable: IObject, index: number) => {
        const {x, y} = drawable;
        return [{
            x,
            y: y - 130,
            type: EDrawableType.OBJECT,
            draw(this: IDrawable) {
                if ((drawable as IRoom).doors.top) {
                    // there is a top door, draw a wall with a top door
                    return (
                        <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="0,0 200,0 200,5 0,5"/>
                            <polygon fill="brown" points="300,0 500,0 500,5 300,5"/>
                        </g>
                    );
                } else {
                    // there is no top door, draw a plain wall
                    return (
                        <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="0,0 500,0 500,5 0,5"/>
                        </g>
                    );
                }
            }
        } as IDrawable, {
            x,
            y,
            type: EDrawableType.OBJECT,
            draw(this: IDrawable) {
                if ((drawable as IRoom).doors.bottom) {
                    // there is a bottom door, draw a wall with a bottom door
                    return (
                        <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="0,295 200,295 200,300 0,300"/>
                            <polygon fill="brown" points="300,295 500,295 500,300 300,300"/>
                        </g>
                    );
                } else {
                    // there is no bottom door, draw a plain wall
                    return (
                        <g key={`room-${index}-wall-bottom`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="0,295 500,295 500,300 0,300"/>
                        </g>
                    );
                }
            }
        } as IDrawable, {
            x,
            y,
            type: EDrawableType.OBJECT,
            draw(this: IDrawable) {
                if ((drawable as IRoom).doors.left) {
                    // there is a left door, draw a wall with a left door
                    return (
                        <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="0,0 5,0 5,100 0,100"/>
                            <polygon fill="brown" points="0,200 5,200 5,300 0,300"/>
                        </g>
                    );
                } else {
                    // there is no left door, draw a plain wall
                    return (
                        <g key={`room-${index}-wall-left`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="0,0 5,0 5,300 0,300"/>
                        </g>
                    );
                }
            }
        } as IDrawable, {
            x,
            y,
            type: EDrawableType.OBJECT,
            draw(this: IDrawable) {
                if ((drawable as IRoom).doors.right) {
                    // there is a right wall, draw a door with a right wall
                    return (
                        <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="495,0 500,0 500,100 495,100"/>
                            <polygon fill="brown" points="495,200 500,200 500,300 495,300"/>
                        </g>
                    );
                } else {
                    // there is no right wall, draw a plain wall
                    return (
                        <g key={`room-${index}-wall-right`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="495,0 500,0 500,300 495,300"/>
                        </g>
                    );
                }
            }
        } as IDrawable];
    };

    /**
     * Create a sorted list of all drawable objects for final rendering. Objects at the bottom should overlap objects
     * above them to create a 2D Stereographic Projection, like a 2D with 3D movement arcade game. Sort [[IDrawable]]s
     * from top to bottom so bottom is drawn last, on top of the [[IDrawable]] above it.
     */
    sortDrawables = () => {
        const component = this;
        const drawables = [
            // add all persons
            ...this.state.persons.map(person => ({
                draw(this: IDrawable) {
                    return component.drawPerson(this as unknown as IPerson);
                },
                type: EDrawableType.PERSON,
                ...person
            }) as IDrawable),

            // for each room
            ...this.state.rooms.reduce((arr: IDrawable[], room: IRoom): IDrawable[] => {
                return [
                    ...arr,

                    // add all chairs
                    ...room.chairs.map((chair, index) => ({
                        draw(this: IObject) {
                            return component.drawChair(this, room, index);
                        },
                        type: EDrawableType.OBJECT,
                        ...chair
                    }) as IDrawable)
                ];
            }, []),

            // for each room
            ...this.state.rooms.reduce((arr: IDrawable[], room: IRoom): IDrawable[] => {
                return [
                    ...arr,

                    // add all tables
                    ...room.tables.map((table, index) => ({
                        draw(this: IObject) {
                            return component.drawTable(this, room, index);
                        },
                        type: EDrawableType.OBJECT,
                        ...table
                    }) as IDrawable)
                ];
            }, []),

            // for each room
            ...this.state.rooms.reduce((arr: IDrawable[], room: IRoom, index: number): IDrawable[] => {
                return [
                    ...arr,

                    // add all walls
                    ...component.drawRoomWalls(room, index)
                ];
            }, [])
        ];

        // sort drawable objects from top to bottom
        return drawables.sort((a, b) => {
            // by default, sort by height difference
            const heightDifference = a.y - b.y;

            if (a.type === EDrawableType.PERSON && b.type !== EDrawableType.PERSON && heightDifference > 30) {
                // person has priority over regular objects
                return 1;
            } else if (b.type === EDrawableType.PERSON && a.type !== EDrawableType.PERSON && heightDifference < 30) {
                // person has priority over regular objects
                return -1;
            } else {
                // sort by height differences
                return heightDifference;
            }
        });
    };

    render() {
        // find the current person
        const currentPerson = this.state.persons.find(person => person.id === this.state.currentPersonId);

        // the offset of the entire world
        let worldOffsetX: number = 0;
        let worldOffsetY: number = 0;

        // if current person exist
        if (currentPerson) {
            // center world around current person, the view should be centered on the person
            worldOffsetX = currentPerson.x - 250;
            worldOffsetY = currentPerson.y - 150;
        }

        return (
            <div className="persons">
                <h1>Multiplayer Room</h1>
                <p>Use the left and right arrow keys or WASD keys to move the player left and right within the room.</p>
                <svg className="game" width={500} height={300} style={{border: "1px solid black"}}>
                    <defs>
                        {
                            this.state.rooms.map((room: IRoom, index: number) => {
                                const {x, y} = room;
                                return (
                                    <mask key={`room-${index}`} id={`room-${index}`} x="0" y="0" width="500" height="300">
                                        <rect fill="white" x={x + 5} y={y - 200} width={490} height={495}/>
                                        {
                                            room.doors.left ?
                                                <>
                                                    <rect fill="white" x={x - 5} y={y + 100} width={10} height={100}/>
                                                    <rect fill="white" x={x - 105} y={y - 200} width={100} height={495}/>
                                                </> :
                                                null
                                        }
                                        {
                                            room.doors.right ?
                                                <>
                                                    <rect fill="white" x={x + 495} y={y + 100} width={10} height={100}/>
                                                    <rect fill="white" x={x + 505} y={y - 200} width={100} height={495}/>
                                                </> :
                                                null
                                        }
                                        {
                                            room.doors.bottom ?
                                                <rect fill="white" x={x + 200} y={y + 295} width={100} height={205}/> :
                                                null
                                        }
                                    </mask>
                                );
                            })
                        }
                    </defs>
                    <g transform={`translate(${-worldOffsetX},${-worldOffsetY})`}>
                        {
                            this.sortDrawables().map(drawable => {
                                return drawable.draw();
                            })
                        }
                    </g>
                </svg>
                <div>
                    <p>Select a custom shirt color for your character.</p>
                    <label>Shirt Color</label>
                    <select onChange={this.handleShirtColor}>
                        <option>grey</option>
                        <option>red</option>
                        <option>blue</option>
                        <option>tan</option>
                        <option>black</option>
                    </select>
                </div>
                <div>
                    <p>Select a custom pant color for your character.</p>
                    <label>Pant Color</label>
                    <select onChange={this.handlePantColor}>
                        <option>blue</option>
                        <option>black</option>
                        <option>grey</option>
                        <option>purple</option>
                        <option>red</option>
                        <option>green</option>
                    </select>
                </div>
            </div>
        );
    }
}
