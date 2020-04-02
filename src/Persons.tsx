import React from 'react';
import './App.scss';
import axios from "axios";

interface IPersonsProps {}

interface IObject {
    x: number;
    y: number;
}

interface IPerson extends IObject {
    id: string;
    shirtColor: string;
    pantColor: string;
    lastUpdate: string;
}

enum EDrawableType {
    PERSON = "PERSON",
    OBJECT = "OBJECT"
}

interface IRoomDoors {
    left: boolean;
    right: boolean;
    top: boolean;
    bottom: boolean;
}

interface IRoom extends IObject {
    doors: IRoomDoors;
    chairs: IObject[];
    tables: IObject[];
}

interface IDrawable extends IObject {
    draw(this: IDrawable): void;
    type: EDrawableType;
}

interface IKeyDownHandler {
    key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "w" | "a" | "s" | "d";
    interval: any;
}

interface IPersonsState {
    persons: IPerson[];
    rooms: IRoom[];
    currentPersonId: string;
    lastUpdate: string;
}

export class Persons extends React.Component<IPersonsProps, IPersonsState> {
    /**
     * The interval containing the game loop.
     */
    intervalGameLoop: any = null;

    /**
     * Set Intervals that move the user across the screen.
     */
    keyDownHandlers: IKeyDownHandler[] = [];

    gameRefreshSpeed: number = 2000;

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

    componentDidMount(): void {
        this.beginGameLoop();
    }

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
        const data = this.state.persons.find(person => person.id === this.state.currentPersonId);
        if (data) {
            await axios.put(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/${this.state.currentPersonId}`, data);
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

    drawPerson = (person: IPerson) => {
        const {x, y} = person;
        let mask: string = "";
        const roomIndex = this.state.rooms.findIndex(this.isInRoom(person));
        if (roomIndex >= 0) {
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

    drawTable = (drawable: IObject, room: IObject, index: number) => {
        const {x, y} = drawable;
        return (
            <g key={`table-${index}`} transform={`translate(${x - 100 + room.x},${y - 50 + room.y})`}>
                <polygon fill="brown" points="0,100 200,100 200,0 0,0"/>
            </g>
        );
    };

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

    drawRoomWalls = (drawable: IObject, index: number) => {
        const {x, y} = drawable;
        return [{
            x,
            y: y - 130,
            type: EDrawableType.OBJECT,
            draw(this: IDrawable) {
                if ((drawable as IRoom).doors.top) {
                    return (
                        <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="0,0 200,0 200,5 0,5"/>
                            <polygon fill="brown" points="300,0 500,0 500,5 300,5"/>
                        </g>
                    );
                } else {
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
                    return (
                        <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="0,295 200,295 200,300 0,300"/>
                            <polygon fill="brown" points="300,295 500,295 500,300 300,300"/>
                        </g>
                    );
                } else {
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
                    return (
                        <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="0,0 5,0 5,100 0,100"/>
                            <polygon fill="brown" points="0,200 5,200 5,300 0,300"/>
                        </g>
                    );
                } else {
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
                    return (
                        <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="495,0 500,0 500,100 495,100"/>
                            <polygon fill="brown" points="495,200 500,200 500,300 495,300"/>
                        </g>
                    );
                } else {
                    return (
                        <g key={`room-${index}-wall-right`} transform={`translate(${x},${y})`}>
                            <polygon fill="brown" points="495,0 500,0 500,300 495,300"/>
                        </g>
                    );
                }
            }
        } as IDrawable];
    };

    sortDrawables = () => {
        const component = this;
        const drawables = [
            ...this.state.persons.map(person => ({
                draw(this: IDrawable) {
                    return component.drawPerson(this as unknown as IPerson);
                },
                type: EDrawableType.PERSON,
                ...person
            }) as IDrawable),
            ...this.state.rooms.reduce((arr: IDrawable[], room: IRoom): IDrawable[] => {
                return [
                    ...arr,
                    ...room.chairs.map((chair, index) => ({
                        draw(this: IObject) {
                            return component.drawChair(this, room, index);
                        },
                        type: EDrawableType.OBJECT,
                        ...chair
                    }) as IDrawable)
                ];
            }, []),
            ...this.state.rooms.reduce((arr: IDrawable[], room: IRoom): IDrawable[] => {
                return [
                    ...arr,
                    ...room.tables.map((table, index) => ({
                        draw(this: IObject) {
                            return component.drawTable(this, room, index);
                        },
                        type: EDrawableType.OBJECT,
                        ...table
                    }) as IDrawable)
                ];
            }, []),
            ...this.state.rooms.reduce((arr: IDrawable[], room: IRoom, index: number): IDrawable[] => {
                return [
                    ...arr,
                    ...component.drawRoomWalls(room, index)
                ];
            }, [])
        ];

        // sort drawable objects from bottom to top
        return drawables.sort((a, b) => {
            const heightDifference = a.y - b.y;

            if (a.type === EDrawableType.PERSON && b.type !== EDrawableType.PERSON && heightDifference > 30) {
                return 1;
            } else if (b.type === EDrawableType.PERSON && a.type !== EDrawableType.PERSON && heightDifference < 30) {
                return -1;
            } else {
                return heightDifference;
            }
        });
    };

    render() {
        const currentPerson = this.state.persons.find(person => person.id === this.state.currentPersonId);
        let worldOffsetX: number = 0;
        let worldOffsetY: number = 0;
        if (currentPerson) {
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
