import React from 'react';
import './App.scss';
import axios from "axios";
import {
    ECarDirection,
    EDrawableType,
    ERoomWallType,
    IApiPersonsGet,
    IApiPersonsPut,
    ICar,
    IDrawable,
    IGameTutorials,
    IKeyDownHandler,
    INetworkObject,
    IObject,
    IPerson,
    IRoom
} from "./types/GameTypes";
import {PersonsLogin} from "./PersonsLogin";
import {IWhichDoorsShouldBeOpen} from "../functions/src/types/GameTypes";

/**
 * The input to the [[Persons]] component that changes how the game is rendered.
 */
interface IPersonsProps {}

/**
 * The state of the game component. The game state is stored in React so all changes to the game state will update the
 * SVG on the screen.
 */
interface IPersonsState {
    /**
     * The number of pixels of the game screen wide.
     */
    width: number;
    /**
     * The number of pixels of the game screen is tall.
     */
    height: number;
    /**
     * The tutorials that should be shown.
     */
    tutorials: IGameTutorials;
    /**
     * A list of persons from the network.
     */
    persons: IPerson[];
    /**
     * A list of rooms in the current building.
     */
    rooms: IRoom[];
    /**
     * A list of cars in the current location.
     */
    cars: ICar[];
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
     * Heartbeat interval which keeps the person logged in.
     */
    intervalHeartbeat: any = null;

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
     * The heartbeat refresh rate. 1000 means 1 second. Decreasing this value will increase how often the game sends
     * a heartbeat for the current user. The heartbeat function will keep the user logged in until the browser is closed.
     */
    heartbeatRefreshSpeed: number = 25000;

    /**
     * The reference to the login component.
     */
    loginRef = React.createRef<PersonsLogin>();

    /**
     * The state of the game.
     */
    state = {
        width: 1000,
        height: 600,
        tutorials: {
            walking: {
                w: false,
                a: false,
                s: false,
                d: false
            },
            driving: true
        },
        persons: [] as IPerson[],
        rooms: [] as IRoom[],
        cars: [] as ICar[],
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
     * Begin the login process.
     */
    beginLogin = () => {
        if (this.loginRef.current) {
            this.loginRef.current.open();
        }
    };

    /**
     * The login component has successfully logged in. Load the username of the login to control the person.
     * @param username The id of the logged in person.
     */
    handleLoginSuccess = (username: string) => {
        this.setState({
            currentPersonId: username
        });
    };

    /**
     * Generate an office.
     * @param id The id of the office.
     * @param x The x position of the office.
     * @param y The y position of the office.
     */
    generateOffice = ({id, x, y}: {id: string, x: number, y: number}): IRoom => {
        return {
            id,
            x,
            y,
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
                left: ERoomWallType.WALL,
                right: ERoomWallType.WALL,
                top: ERoomWallType.WALL,
                bottom: ERoomWallType.WALL
            }
        } as IRoom;
    };

    /**
     * Generate a hallway.
     * @param id The id of the hallway
     * @param x The x position of the hallway.
     * @param y THe y position of the hallway.
     */
    generateHallway = ({id, x, y}: {id: string, x: number, y: number}): IRoom => {
        return {
            id,
            x,
            y,
            chairs: [] as IObject[],
            tables: [] as IObject[],
            doors: {
                left: ERoomWallType.WALL,
                right: ERoomWallType.WALL,
                top: ERoomWallType.WALL,
                bottom: ERoomWallType.WALL
            }
        } as IRoom;
    };

    /**
     * Generate an entrance.
     * @param id The id of the entrance
     * @param x The x position of the hallway.
     * @param y THe y position of the hallway.
     */
    generateEntrance = ({id, x, y}: {id: string, x: number, y: number}): IRoom => {
        return {
            id,
            x,
            y,
            chairs: [] as IObject[],
            tables: [] as IObject[],
            doors: {
                left: ERoomWallType.OPEN,
                right: ERoomWallType.OPEN,
                top: ERoomWallType.OPEN,
                bottom: ERoomWallType.OPEN
            }
        } as IRoom;
    };

    /**
     * Map a roomString to a generated room.
     * @param prefix The house prefix.
     * @param x The x position within the house.
     * @param y The y position within the house.
     */
    roomStringToRoom = ({prefix, offset: {x, y}}: {prefix: string, offset: IObject}) => (roomString: string): IRoom | null => {
        switch (roomString) {
            case "O": return this.generateOffice({id: `${prefix}-office-${x}-${y}`, x, y});
            case "H": return this.generateHallway({id: `${prefix}-hallway-${x}-${y}`, x, y});
            case "E": return this.generateEntrance({id: `${prefix}-entrance-${x}-${y}`, x, y});
            default:
                return null;
        }
    };

    /**
     * Determine if room is nearby another room.
     * @param a The room to test being nearby room b.
     */
    roomIsNearbyRoom = (a: IRoom) => (b: IRoom) => {
        return b.x >= a.x - 500 && b.x <= a.x + 500 && b.y >= a.y - 300 && b.y <= a.y + 300;
    };

    /**
     * Return which doors should be open given a room and an array of nearby rooms.
     * @param room The room which doors should be computed.
     * @param nearbyRooms The array of nearby rooms.
     */
    whichDoorsShouldBeOpen = (room: IRoom, nearbyRooms: IRoom[]): IWhichDoorsShouldBeOpen => {
        const up = nearbyRooms.some((nearbyRoom) => {
            return Math.abs(nearbyRoom.x - room.x) < 10 && Math.abs(nearbyRoom.y - room.y + 300) < 10;
        });
        const down = nearbyRooms.some((nearbyRoom) => {
            return Math.abs(nearbyRoom.x - room.x) < 10 && Math.abs(nearbyRoom.y - room.y - 300) < 10;
        });
        const left = nearbyRooms.some((nearbyRoom) => {
            return Math.abs(nearbyRoom.y - room.y) < 10 && Math.abs(nearbyRoom.x - room.x + 500) < 10;
        });
        const right = nearbyRooms.some((nearbyRoom) => {
            return Math.abs(nearbyRoom.y - room.y) < 10 && Math.abs(nearbyRoom.x - room.x - 500) < 10;
        });

        return {
            up,
            down,
            left,
            right
        } as IWhichDoorsShouldBeOpen;
    };

    /**
     * Apply doors onto the room mutably.
     * @param room The room which should be modified with new doors.
     * @param whichDoorsShouldBeOpen The doors to open.
     * @param value The type of wall to be drawn.
     */
    applyWhichDoorsShouldBeOpen = (room: IRoom, whichDoorsShouldBeOpen: IWhichDoorsShouldBeOpen, value: ERoomWallType): void => {
        if (whichDoorsShouldBeOpen.up) {
            room.doors.top = value;
        }
        if (whichDoorsShouldBeOpen.down) {
            room.doors.bottom = value;
        }
        if (whichDoorsShouldBeOpen.left) {
            room.doors.left = value;
        }
        if (whichDoorsShouldBeOpen.right) {
            room.doors.right = value;
        }
    };

    /**
     * Generate a house from a format string.
     * @param prefix The house prefix.
     * @param format A string containing the layout of the house.
     * @param offset The offset of the house.
     */
    generateHouse = ({prefix, format, offset}: {prefix: string, format: string, offset: IObject}): IRoom[] => {
        const rooms = [] as IRoom[];

        // for each line
        const rows = format.split(/\r|\n|\r\n/);
        rows.forEach((row: string, rowIndex: number) => {
            // for each letter
            const roomStrings = row.split("");
            // map letter to room
            roomStrings.forEach((roomString: string, columnIndex: number) => {
                const room = this.roomStringToRoom({
                    prefix,
                    offset: {
                        x: columnIndex * 500 + offset.x,
                        y: rowIndex * 300 + offset.y
                    }
                })(roomString);
                if (room) {
                    rooms.push(room);
                }
            });
        });

        // build doors from hallways to any room
        const hallways = rooms.filter(room => room.id.includes("hallway"));
        const notHallways = rooms.filter(room => !room.id.includes("hallway"));
        hallways.forEach(hallway => {
            {
                // find nearby hallways, make open
                const nearbyRooms = hallways.filter(this.roomIsNearbyRoom(hallway));
                const whichDoorsShouldBeOpen = this.whichDoorsShouldBeOpen(hallway, nearbyRooms);
                this.applyWhichDoorsShouldBeOpen(hallway, whichDoorsShouldBeOpen, ERoomWallType.OPEN);
            }
            {
                // find nearby rooms that are not hallways, make door
                const nearbyRooms = notHallways.filter(this.roomIsNearbyRoom(hallway));
                const whichDoorsShouldBeOpen = this.whichDoorsShouldBeOpen(hallway, nearbyRooms);
                this.applyWhichDoorsShouldBeOpen(hallway, whichDoorsShouldBeOpen, ERoomWallType.DOOR);
            }
        });

        // build doors from offices to hallways
        const offices = rooms.filter(room => room.id.includes("office"));
        offices.forEach(office => {
            // find nearby hallways, add door
            const nearbyRooms = hallways.filter(this.roomIsNearbyRoom(office));
            const whichDoorsShouldBeOpen = this.whichDoorsShouldBeOpen(office, nearbyRooms);
            this.applyWhichDoorsShouldBeOpen(office, whichDoorsShouldBeOpen, ERoomWallType.DOOR);
        });

        // build doors from entrances to hallways
        const entrances = rooms.filter(room => room.id.includes("entrance"));
        entrances.forEach(entrance => {
            // find nearby hallways, add door
            const nearbyRooms = hallways.filter(this.roomIsNearbyRoom(entrance));
            const whichDoorsShouldBeOpen = this.whichDoorsShouldBeOpen(entrance, nearbyRooms);
            this.applyWhichDoorsShouldBeOpen(entrance, whichDoorsShouldBeOpen, ERoomWallType.ENTRANCE);
        });


        return rooms;
    };

    /**
     * If the walking tutorial should be shown.
     */
    showWalkingTutorial = () => {
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            // there is a current person
            const {w, a, s, d} = this.state.tutorials.walking;
            // one of the WASD keys has not been pressed yet, show walking tutorial
            return !w || !a || !s || !d;
        } else {
            // no current person, do not show tutorial
            return false;
        }
    };

    /**
     * If the driving text should be shown. Only when inside of a car.
     */
    showDrivingText = () => {
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            // if the current person is inside of a car
            return this.state.cars.some(this.isInCar(currentPerson));
        } else {
            // no current person, cannot be inside a car without a person
            return false;
        }
    };

    /**
     * If the driving tutorial should be shown.
     */
    showDrivingTutorial = () => {
        return this.showDrivingText() && this.state.tutorials.driving;
    };

    /**
     * Update the game in the database.
     */
    updateGame = async (data: IApiPersonsPut) => {
        // person exist, update the database with the current copy of current person.
        await axios.put("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/data", data);
        // wait for [[state.lastUpdate]] to update after the network call.
        await new Promise((resolve) => {
            this.setState({
                lastUpdate: new Date().toISOString()
            }, () => {
                resolve();
            });
        });
    };

    /**
     * Begin the game loop.
     */
    beginGameLoop = () => {
        // add keyboard events
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);

        // begin game loop
        this.intervalGameLoop = setTimeout(this.gameLoop, this.gameRefreshSpeed);
        this.intervalHeartbeat = setInterval(this.heartbeat, this.heartbeatRefreshSpeed);

        // generate some houses
        const format = "" +
            "  E  \n" +
            "OHHO \n" +
            "OHOH \n" +
            " E   ";
        const rooms = [format, format, format].reduce((arr: IRoom[], f: string, index: number): IRoom[] => {
            return [
                ...arr,
                ...this.generateHouse({
                    prefix: `house-${index}`,
                    format,
                    offset: {
                        x: index * 2500,
                        y: 0
                    }
                })
            ];
        }, []);
        this.setState({rooms});
    };

    /**
     * End the game loop.
     */
    endGameLoop = () => {
        // remove keyboard events
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);

        // stop the heartbeat
        if (this.intervalHeartbeat) {
            clearTimeout(this.intervalHeartbeat);
            this.intervalGameLoop = null;
        }

        // stop game loop
        if (this.intervalGameLoop) {
            clearTimeout(this.intervalGameLoop);
            this.intervalGameLoop = null;
        }
    };

    /**
     * Merge local and network sets of [[INetworkObject]] arrays.
     * @param localArr The local data.
     * @param networkArr The network data.
     * @param networkItem A single network data item.
     */
    updateMergeLocalAndNetworkData = <T extends INetworkObject>(localArr: T[], networkArr: T[], networkItem: T): T[] => {
        // find local data
        const localItem = localArr.find(d => d.id === networkItem.id);

        // check to see if the local data is more up to date.
        if (localItem && +Date.parse(localItem.lastUpdate) > +Date.parse(networkItem.lastUpdate)) {
            // local data is more up to date, replace server position with local position, to prevent backward moving glitch
            const {x, y} = localItem;
            return [
                ...networkArr,
                {
                    ...networkItem,
                    x,
                    y
                }
            ]
        } else {
            // server is up to date, no changes
            return [...networkArr, networkItem];
        }
    };

    /**
     * Keep the person logged in by updating their last update timestamp every 25 seconds.
     */
    heartbeat = () => {
        this.updatePersonProperty((person: IPerson) => person);
    };

    /**
     * Update the state of the game.
     */
    gameLoop = async () => {
        // get list of persons and cars that have changed
        const personsToUpdate = this.state.persons.filter(person => +Date.parse(this.state.lastUpdate) < +Date.parse(person.lastUpdate));
        const carsToUpdate = this.state.cars.filter(car => +Date.parse(this.state.lastUpdate) < +Date.parse(car.lastUpdate));

        // update all changed persons and cars
        await this.updateGame({
            persons: personsToUpdate,
            cars: carsToUpdate
        });

        // get a list of persons from the database
        const response = await axios.get<IApiPersonsGet>("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/data");
        if (response && response.data) {
            // get persons data from the server
            const {persons: serverPersons, cars: serverCars} = response.data;

            // modify server data with local data, pick most up to date version of the data
            const persons = serverPersons.reduce((arr: IPerson[], person: IPerson): IPerson[] => {
                return this.updateMergeLocalAndNetworkData(this.state.persons, arr, person);
            }, []);
            const cars = serverCars.reduce((arr: ICar[], car: ICar): ICar[] => {
                return this.updateMergeLocalAndNetworkData(this.state.cars, arr, car);
            }, []);
            this.setState({
                persons,
                cars,
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

    /**
     * Find the current person in the game state.
     */
    getCurrentPerson = (): IPerson | undefined => {
        return this.state.persons.find(person => person.id === this.state.currentPersonId);
    };

    /**
     * Update current person and car passengers in the person array. Return the array to save as a new React state.
     * @param update The update to perform on current person and car passengers.
     */
    updatePersons = (update: (person: IPerson, car?: ICar) => IPerson): IPerson[] => {
        // get all passengers in the car with the current person
        const passengers = [] as IPerson[];
        const currentPerson = this.getCurrentPerson();
        if (currentPerson && currentPerson.carId) {
            const currentCar = this.state.cars.find(car => car.id === currentPerson.carId);
            if (currentCar) {
                passengers.push(...this.state.persons.filter(person => currentPerson && person.carId === currentCar.id && person.id !== currentPerson.id));
            }
        }

        return this.state.persons.reduce((arr: IPerson[], person: IPerson): IPerson[] => {
            // if current person or passenger in the car with the current person
            if (person.id === this.state.currentPersonId || passengers.map(passenger => passenger.id).includes(person.id)) {
                // perform movement update with current person, any passengers, and the car
                const car = this.state.cars.find(car => car.id === person.carId);
                return [...arr, {
                    ...update(person, car),
                    lastUpdate: new Date().toISOString()
                }];
            } else {
                // not current person or passenger in car with the current person, do nothing
                return [...arr, person];
            }
        }, []);
    };

    /**
     * Update only the current person in the person array. Return the array to save as a new React state.
     * @param update The update to perform on current person.
     */
    updateCurrentCar = (update: (car: ICar) => ICar): ICar[] => {
        const currentPerson = this.getCurrentPerson();
        if (currentPerson && currentPerson.carId) {
            return this.state.cars.reduce((arr: ICar[], car: ICar): ICar[] => {
                if (car.id === currentPerson.carId) {
                    return [...arr, {
                        ...update(car),
                        lastUpdate: new Date().toISOString()
                    }];
                } else {
                    return [...arr, car];
                }
            }, []);
        } else {
            return this.state.cars;
        }
    };

    /**
     * How many milliseconds should the setInterval take when handling a person's speed. A lower number will perform
     * faster movement.
     * @param person The person to move.
     */
    personIntervalSpeed = (person: IPerson): number => {
        if (person.carId) {
            // the person is in a car, move every 33 milliseconds, or 30 times a second
            return 33;
        } else {
            // the person is not in a car, move every 100 milliseconds, or 10 times a second
            return 100;
        }
    };

    /**
     * Get the person offset relatve to a car.
     * @param person Person to calculate offset for.
     * @param car Car to calculate offset for.
     */
    getPersonOffset = (person: IObject, car: IObject): IObject => {
        return {
            x: person.x - car.x,
            y: person.y - car.y
        };
    };

    /**
     * Rotate offset by 90 degrees clockwise.
     * @param offset Offset to rotate.
     */
    rotate90 = (offset: IObject): IObject => {
        // noinspection JSSuspiciousNameCombination
        return {
            x: -offset.y,
            y: offset.x
        } as IObject;
    };

    /**
     * Perform a person offset rotation relative to the change in car direction.
     * @param prevDirection The previous car direction.
     * @param direction The new car direction.
     * @param offset The offset to rotate to match direction.
     */
    rotatePersonOffset = (prevDirection: ECarDirection, direction: ECarDirection, offset: IObject): IObject => {
        switch (prevDirection) {
            default:
            case ECarDirection.UP: {
                switch (direction) {
                    default:
                    case ECarDirection.UP: return offset;
                    case ECarDirection.RIGHT: return this.rotate90(offset);
                    case ECarDirection.DOWN: return this.rotate90(this.rotate90(offset));
                    case ECarDirection.LEFT: return this.rotate90(this.rotate90(this.rotate90(offset)));
                }
            }
            case ECarDirection.RIGHT: {
                switch (direction) {
                    default:
                    case ECarDirection.RIGHT: return offset;
                    case ECarDirection.DOWN: return this.rotate90(offset);
                    case ECarDirection.LEFT: return this.rotate90(this.rotate90(offset));
                    case ECarDirection.UP: return this.rotate90(this.rotate90(this.rotate90(offset)));
                }
            }
            case ECarDirection.DOWN: {
                switch (direction) {
                    default:
                    case ECarDirection.DOWN: return offset;
                    case ECarDirection.LEFT: return this.rotate90(offset);
                    case ECarDirection.UP: return this.rotate90(this.rotate90(offset));
                    case ECarDirection.RIGHT: return this.rotate90(this.rotate90(this.rotate90(offset)));
                }
            }
            case ECarDirection.LEFT: {
                switch (direction) {
                    default:
                    case ECarDirection.LEFT: return offset;
                    case ECarDirection.UP: return this.rotate90(offset);
                    case ECarDirection.RIGHT: return this.rotate90(this.rotate90(offset));
                    case ECarDirection.DOWN: return this.rotate90(this.rotate90(this.rotate90(offset)));
                }
            }
        }
    };

    /**
     * Generic handler that handles any keyboard movement, add update function to determine how to update the object.
     * The code for WASD keys movement is identical except for one line, adding or subtracting x or y.
     * @param event The keyboard event which contains which key was pressed.
     * @param person The cached copy of a person, used for determining speed of setInterval.
     */
    handleKeyDownMovementPerson = (event: KeyboardEvent, person: IPerson) => (
        updatePerson: (person: IPerson, car?: ICar) => IPerson,
        updateCar: (car: ICar) => ICar
    ) => {
        this.keyDownHandlers.push({
            key: event.key as any,
            interval: setInterval(() => {
                // create an array of updates
                // add person array to updates
                const stateUpdates = [] as Array<Partial<IPersonsState>>;

                /**
                 * Update the person's car position if the person is driving the car.
                 */
                // update cars and include into array of updates
                // determine if current person is in a car
                let currentPersonInCar: boolean = false;
                const currentPerson = this.getCurrentPerson();
                if (currentPerson) {
                    currentPersonInCar = !!currentPerson.carId;
                }

                // if person is in car, update cars, add to state updates
                if (currentPersonInCar) {
                    // update person array
                    const persons = this.updatePersons(updatePerson);
                    stateUpdates.push({persons});

                    // update car array
                    const cars = this.updateCurrentCar(updateCar);
                    stateUpdates.push({cars});
                } else {
                    // update person array
                    const persons = this.updatePersons(updatePerson);
                    stateUpdates.push({persons});
                }

                // merge optional state updates into one state update object to perform a single setState.
                const stateUpdate: IPersonsState = Object.assign.apply({}, [{}, ...stateUpdates]);
                this.setState(stateUpdate);
            }, this.personIntervalSpeed(person))
        });
    };

    /**
     * Change a property on the current person.
     * @param update A function that performs the property update.
     */
    handlePersonPropertyChange = (update: (person: IPerson) => IPerson) => {
        const persons = this.updatePersons(update);
        this.setState({persons});
    };

    /**
     * Record a key press as pressed for the walking tutorial.
     * @param key The key that was pressed.
     */
    handleWalkingTutorialKey = (key: "w" | "a" | "s" | "d") => {
        if (!this.state.tutorials.walking[key]) {
            this.setState({
                tutorials: {
                    ...this.state.tutorials,
                    walking: {
                        ...this.state.tutorials.walking,
                        [key]: true
                    }
                }
            });
        }
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

        // find the current person
        // the current person is cached for determining speed of a setInterval callback.
        const currentPerson = this.getCurrentPerson();
        if (!currentPerson) {
            // no current person, do nothing
            return;
        }

        // for each key press type
        switch (event.key) {
            case "w":
            case "ArrowUp": {
                this.handleKeyDownMovementPerson(event, currentPerson)((person: IPerson, car?: ICar): IPerson => {
                    if (car) {
                        const personOffsetInCar = this.getPersonOffset(person, car);
                        const rotatedPersonOffsetInCar = this.rotatePersonOffset(car.direction, ECarDirection.UP, personOffsetInCar);
                        return {
                            ...person,
                            x: car.x + rotatedPersonOffsetInCar.x,
                            y: car.y + rotatedPersonOffsetInCar.y - 10
                        };
                    } else {
                        return {
                            ...person,
                            y: person.y - 10
                        };
                    }
                }, (car: ICar): ICar => ({
                    ...car,
                    y: car.y - 10,
                    direction: ECarDirection.UP
                }));
                break;
            }
            case "s":
            case "ArrowDown": {
                this.handleKeyDownMovementPerson(event, currentPerson)((person: IPerson, car?: ICar): IPerson => {
                    if (car) {
                        const personOffsetInCar = this.getPersonOffset(person, car);
                        const rotatedPersonOffsetInCar = this.rotatePersonOffset(car.direction, ECarDirection.DOWN, personOffsetInCar);
                        return {
                            ...person,
                            x: car.x + rotatedPersonOffsetInCar.x,
                            y: car.y + rotatedPersonOffsetInCar.y + 10
                        };
                    } else {
                        return {
                            ...person,
                            y: person.y + 10
                        };
                    }
                }, (car: ICar): ICar => ({
                    ...car,
                    y: car.y + 10,
                    direction: ECarDirection.DOWN
                }));
                break;
            }
            case "a":
            case "ArrowLeft": {
                this.handleKeyDownMovementPerson(event, currentPerson)((person: IPerson, car?: ICar): IPerson => {
                    if (car) {
                        const personOffsetInCar = this.getPersonOffset(person, car);
                        const rotatedPersonOffsetInCar = this.rotatePersonOffset(car.direction, ECarDirection.LEFT, personOffsetInCar);
                        return {
                            ...person,
                            x: car.x + rotatedPersonOffsetInCar.x - 10,
                            y: car.y + rotatedPersonOffsetInCar.y
                        };
                    } else {
                        return {
                            ...person,
                            x: person.x - 10
                        };
                    }
                }, (car: ICar): ICar => ({
                    ...car,
                    x: car.x - 10,
                    direction: ECarDirection.LEFT
                }));
                break;
            }
            case "d":
            case "ArrowRight": {
                this.handleKeyDownMovementPerson(event, currentPerson)((person: IPerson, car?: ICar): IPerson => {
                    if (car) {
                        const personOffsetInCar = this.getPersonOffset(person, car);
                        const rotatedPersonOffsetInCar = this.rotatePersonOffset(car.direction, ECarDirection.RIGHT, personOffsetInCar);
                        return {
                            ...person,
                            x: car.x + rotatedPersonOffsetInCar.x + 10,
                            y: car.y + rotatedPersonOffsetInCar.y
                        };
                    } else {
                        return {
                            ...person,
                            x: person.x + 10
                        };
                    }
                }, (car: ICar): ICar => ({
                    ...car,
                    x: car.x + 10,
                    direction: ECarDirection.RIGHT
                }));
                break;
            }
            case "e": {
                this.handlePersonPropertyChange((person: IPerson): IPerson => {
                    const car = this.state.cars.find(this.isInCar(person));
                    if (car) {
                        return {
                            ...person,
                            carId: person.carId === car.id ? null : car.id
                        };
                    } else if (person.carId) {
                        return {
                            ...person,
                            carId: null
                        };
                    } else {
                        return person;
                    }
                });
                break;
            }
        }

        // handle a walking tutorial key press
        switch (event.key) {
            case "w":
            case "a":
            case "s":
            case "d": {
                this.handleWalkingTutorialKey(event.key);
                break;
            }
            default:
                break;
        }

        // if the e key was pressed and the driving tutorial is shown
        if (event.key === "e" && this.state.tutorials.driving) {
            // hide driving tutorial
            this.setState({
                tutorials: {
                    ...this.state.tutorials,
                    driving: false
                }
            });
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
        const persons = this.updatePersons(update);
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
     * Determine if an object is inside the car.
     * @param position The object to test.
     */
    isInCar = (position: IObject) => (car: ICar): boolean => {
        switch (car.direction) {
            default:
            case ECarDirection.UP:
            case ECarDirection.DOWN:
                return position.x >= car.x - 50 && position.x <= car.x + 50 &&
                    position.y >= car.y - 100 && position.y <= car.y + 100;
            case ECarDirection.LEFT:
            case ECarDirection.RIGHT:
                return position.x >= car.x - 100 && position.x <= car.x + 100 &&
                    position.y >= car.y - 50 && position.y <= car.y + 50;
        }
    };

    /**
     * Draw a person as some SVG elements.
     * @param person The person to draw.
     */
    drawPerson = (person: IPerson) => {
        const {x, y} = person;

        // the mask property which will mask the person's body so the bottom half of the person does not appear below a wall
        let roomMask: string = "";
        let carMask: string = "";

        // find which room the person is in
        const roomIndex = this.state.rooms.findIndex(this.isInRoom(person));
        if (roomIndex >= 0) {
            // person is in a room, apply the room mask
            roomMask = `url(#room-${roomIndex})`;
        }

        // find which car the person is in
        const car = this.state.cars.find(this.isInCar(person));
        if (car) {
            // person is in a room, apply the room mask
            switch (car.direction) {
                default:
                case ECarDirection.DOWN:
                case ECarDirection.UP: {
                    carMask = `url(#car-${car.id}-down)`;
                    break;
                }
                case ECarDirection.LEFT:
                case ECarDirection.RIGHT: {
                    carMask = `url(#car-${car.id}-left)`;
                    break;
                }
            }
        }

        return (
            <g key={person.id} x="0" y="0" width="500" height="300" mask={roomMask}>
                <g key={person.id} x="0" y="0" width="500" height="300" mask={carMask}>
                    <g key={person.id} transform={`translate(${x - 50},${y - 100})`}>
                        <polygon fill="yellow" points="40,10 60,10 60,30 40,30"/>
                        <polygon fill={person.shirtColor} points="20,30 80,30 80,100 20,100"/>
                        <polygon fill={person.pantColor} points="20,100 80,100 80,120 20,120"/>
                        <polygon fill={person.pantColor} points="20,120 40,120 40,200 20,200"/>
                        <polygon fill={person.pantColor} points="80,120 60,120 60,200 80,200"/>
                    </g>
                </g>
            </g>
        );
    };

    /**
     * Draw a person as some SVG elements.
     * @param car The person to draw.
     */
    drawCar = (car: ICar): IDrawable[] => {
        const {x, y} = car;

        // the mask property which will mask the car so the bottom half of the car does not appear below a wall
        let mask: string = "";
        // find which room the car is in
        const roomIndex = this.state.rooms.findIndex(this.isInRoom(car));
        if (roomIndex >= 0) {
            // car is in a room, apply the room mask
            mask = `url(#room-${roomIndex})`;
        }

        // return a list of drawable car parts
        switch (car.direction) {
            default:
            case ECarDirection.DOWN: return [{
                // draw the back of the car
                x,
                y: y - 100,
                type: EDrawableType.OBJECT,
                draw(this: IDrawable) {
                    return (
                        <g key={`car-top-${car.id}`} x="0" y="0" width="100" height="200" mask={mask}>
                            <g key={car.id} transform={`translate(${x},${y})`}>
                                <polygon fill="lightblue" points="-50,-100 50,-100 50,50, -50,50"/>
                                <polygon fill="grey" stroke="black" strokeWidth={2} points="-40,-90 40,-90 40,50, -40,50"/>
                                <polyline stroke="black" strokeWidth={2} points="-20,-90 -20,50"/>
                                <polyline stroke="black" strokeWidth={2} points="0,-90 0,50"/>
                                <polyline stroke="black" strokeWidth={2} points="20,-90 20,50"/>
                            </g>
                        </g>
                    );
                }
            }, {
                // draw the front of the car
                x,
                y,
                type: EDrawableType.OBJECT,
                draw(this: IDrawable) {
                    return (
                        <g key={`car-bottom-${car.id}`} x="0" y="0" width="100" height="200" mask={mask}>
                            <g key={car.id} transform={`translate(${x},${y})`}>
                                <polygon fill="lightblue" opacity={0.5} points="-40,0 40,0 50,50 -50,50"/>
                                <polygon fill="lightblue" points="-50,50 50,50 50,100 -50,100"/>
                                <polygon fill="white" stroke="black" strokeWidth={2} points="-40,70 40,70 40,90 -40,90"/>
                                <polyline stroke="black" strokeWidth={2} points="-20,70 -20,90"/>
                                <polyline stroke="black" strokeWidth={2} points="0,70 0,90"/>
                                <polyline stroke="black" strokeWidth={2} points="20,70 20,90"/>
                            </g>
                        </g>
                    );
                }
            }];
            case ECarDirection.UP: return [{
                // draw the back of the car
                x,
                y: y - 100,
                type: EDrawableType.OBJECT,
                draw(this: IDrawable) {
                    return (
                        <g key={`car-top-${car.id}`} x="0" y="0" width="100" height="200" mask={mask}>
                            <g key={car.id} transform={`translate(${x},${y})`}>
                                <polygon fill="lightblue" opacity={0.5} points="-40,-100 40,-100 50,-80 -50,-80"/>
                                <polygon fill="lightblue" points="-50,-80 50,-80 50,50 -50,50"/>
                                <polygon fill="grey" stroke="black" strokeWidth={2} points="-40,-70 40,-70 40,50 -40,50"/>
                                <polyline stroke="black" strokeWidth={2} points="-20,-70 -20,50"/>
                                <polyline stroke="black" strokeWidth={2} points="0,-70 0,50"/>
                                <polyline stroke="black" strokeWidth={2} points="20,-70 20,50"/>
                            </g>
                        </g>
                    );
                }
            }, {
                // draw the front of the car
                x,
                y,
                type: EDrawableType.OBJECT,
                draw(this: IDrawable) {
                    return (
                        <g key={`car-bottom-${car.id}`} x="0" y="0" width="100" height="200" mask={mask}>
                            <g key={car.id} transform={`translate(${x},${y})`}>
                                <polygon fill="lightblue" points="-50,50 50,50 50,100 -50,100"/>
                                <polygon fill="red" stroke="black" strokeWidth={2} points="-40,60 -20,60 -20,80 -40,80"/>
                                <polygon fill="red" stroke="black" strokeWidth={2} points="40,60 20,60 20,80 40,80"/>
                                <polygon fill="white" stroke="black" strokeWidth={2} points="-10,60 10,60 10,80 -10,80"/>
                            </g>
                        </g>
                    );
                }
            }];
            case ECarDirection.RIGHT:
            case ECarDirection.LEFT: return [{
                // draw the back of the car
                x,
                y: y - 50,
                type: EDrawableType.OBJECT,
                draw(this: IDrawable) {
                    return (
                        <g key={`car-top-${car.id}`} x="0" y="0" width="200" height="100" mask={mask}>
                            <g key={car.id} transform={`translate(${x},${y})${car.direction === ECarDirection.RIGHT ? " scale(-1,1)": ""}`}>
                                <polygon fill="lightblue" opacity={0.5} points="-40,-50 -40,-20 -50,-20"/>
                                <polygon fill="lightblue" points="-50,-20 100,-20 100,25 -100,25 -100,0 -75,0"/>
                                <polygon fill="grey" stroke="black" strokeWidth={2} points="-40,-10 90,-10 90,25 -40,25"/>
                                <polyline stroke="black" strokeWidth={2} points="-40,10 90,10"/>
                            </g>
                        </g>
                    );
                }
            }, {
                // draw the front of the car
                x,
                y: y + 100,
                type: EDrawableType.OBJECT,
                draw(this: IDrawable) {
                    return (
                        <g key={`car-bottom-${car.id}`} x="0" y="0" width="200" height="100" mask={mask}>
                            <g key={car.id} transform={`translate(${x},${y})${car.direction === ECarDirection.RIGHT ? " scale(-1,1)": ""}`}>
                                <polygon fill="lightblue" points="-100,25 100,25 100,50 -100,50"/>
                                <polygon fill="white" stroke="black" strokeWidth={2} points="-100,25 -80,25 -80,35 -100,35"/>
                                <polygon fill="red" stroke="black" strokeWidth={2} points="100,25 80,25 80,35 100,35"/>
                            </g>
                        </g>
                    );
                }
            }];
        }
    };

    /**
     * Draw a table in a room.
     * @param drawable The table to draw.
     * @param room The room the table is in.
     * @param index The index of the table.
     */
    drawTable = (drawable: IObject, room: IRoom, index: number) => {
        const {x, y} = drawable;
        return (
            <g key={`room-${room.id}-table-${index}`} transform={`translate(${x - 100 + room.x},${y - 50 + room.y})`}>
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
    drawChair = (drawable: IObject, room: IRoom, index: number) => {
        const {x, y} = drawable;
        return (
            <g key={`room-${room.id}-chair-${index}`} transform={`translate(${x - 50 + room.x},${y - 50 + room.y})`}>
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
        const drawables = [] as IDrawable[];

        // top wall
        switch ((drawable as IRoom).doors.top) {
            case ERoomWallType.DOOR: {
                // there is a top door, draw a wall with a top door
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 200,0 200,5 0,5"/>
                            </g>
                        );
                    }
                } as IDrawable, {
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="300,0 500,0 500,5 300,5"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            case ERoomWallType.ENTRANCE: {
                // draw an entrance at the top of the building
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 200,0 200,5 0,5"/>
                            </g>
                        );
                    }
                } as IDrawable, {
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="300,0 500,0 500,5 300,5"/>
                            </g>
                        );
                    }
                } as IDrawable, {
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top-door`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="195,0 195,-205 305,-205 305,0 300,0 300,-200 200,-200 200,0"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            default:
            case ERoomWallType.WALL: {
                // there is no top door, draw a plain wall
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-top`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 500,0 500,5 0,5"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            case ERoomWallType.OPEN: {
                // do nothing
            }
        }

        // draw bottom wall
        switch ((drawable as IRoom).doors.bottom) {
            case ERoomWallType.DOOR: {
                // there is a bottom door, draw a wall with a bottom door
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,295 200,295 200,300 0,300"/>
                            </g>
                        );
                    }
                } as IDrawable, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="300,295 500,295 500,300 300,300"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            case ERoomWallType.ENTRANCE: {
                // there is an entrance at the bottom of the room
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,295 200,295 200,300 0,300"/>
                            </g>
                        );
                    }
                } as IDrawable, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="300,295 500,295 500,300 300,300"/>
                            </g>
                        );
                    }
                } as IDrawable, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom-door`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="195,300 195,95 305,95 305,300 300,300 300,100 200,100 200,300"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            default:
            case ERoomWallType.WALL: {
                // there is an entrance at the bottom of the room
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-bottom`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,295 500,295 500,300 0,300"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            case ERoomWallType.OPEN: {
                // do nothing
            }
        }

        // draw left wall
        switch ((drawable as IRoom).doors.left) {
            case ERoomWallType.ENTRANCE:
            case ERoomWallType.DOOR: {
                // there is a left door, draw a wall with a left door
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-left-top`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 5,0 5,100 0,100"/>
                            </g>
                        );
                    }
                } as IDrawable, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-left-bottom`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,200 5,200 5,300 0,300"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            default:
            case ERoomWallType.WALL: {
                // there is no left door, draw a plain wall
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-left`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="0,0 5,0 5,300 0,300"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            case ERoomWallType.OPEN: {
                // do nothing
            }
        }

        // draw right wall
        switch ((drawable as IRoom).doors.right) {
            case ERoomWallType.ENTRANCE:
            case ERoomWallType.DOOR: {
                // there is a right wall, draw a door with a right wall
                drawables.push({
                    x,
                    y: y + 30,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-right-top`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="495,0 500,0 500,100 495,100"/>
                            </g>
                        );
                    }
                } as IDrawable, {
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-right-bottom`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="495,200 500,200 500,300 495,300"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            default:
            case ERoomWallType.WALL: {
                // there is no right wall, draw a plain wall
                drawables.push({
                    x,
                    y: y + 330,
                    type: EDrawableType.OBJECT,
                    draw(this: IDrawable) {
                        return (
                            <g key={`room-${index}-wall-right`} transform={`translate(${x},${y})`}>
                                <polygon fill="brown" points="495,0 500,0 500,300 495,300"/>
                            </g>
                        );
                    }
                } as IDrawable);
                break;
            }
            case ERoomWallType.OPEN: {
                // do nothing
            }
        }
        return drawables;
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
            }, []),

            // for each car
            ...this.state.cars.reduce((arr: IDrawable[], car: ICar): IDrawable[] => {
                return [
                    ...arr,

                    // add all car parts
                    ...component.drawCar(car)
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

    /**
     * Generate a list of grass tiles to draw. The tiles should always be around the world view. Should reduce the
     * amount of grass drawn in the world.
     * @param worldOffset The offset of the camera.
     */
    generateGrassTile = (worldOffset: IObject): IObject[] => {
        const tileWidth = 500;
        const tileHeight = 300;

        // calculate current tile position
        const tilePosition: IObject = {
            x: Math.round(worldOffset.x / tileWidth),
            y: Math.round(worldOffset.y / tileHeight)
        };

        // calculate a list of tiles around the world view, it should cover the world view
        const tilePositions = [] as IObject[];
        // for the x axis, go from most left to most right tile
        for (let i = -Math.floor(this.state.width / tileWidth); i <= Math.ceil(this.state.width / tileWidth); i++) {
            // for the y axis, go from most top to most bottom tile
            for (let j = -Math.floor(this.state.height / tileHeight); j <= Math.ceil(this.state.height / tileHeight); j++) {
                // add tile
                tilePositions.push({
                    x: (tilePosition.x + i) * tileWidth,
                    y: (tilePosition.y + j) * tileHeight
                } as IObject);
            }
        }

        console.log(tilePositions);
        return tilePositions;
    };

    render() {
        // find the current person
        const currentPerson = this.getCurrentPerson();

        // the offset of the entire world
        let worldOffsetX: number = 0;
        let worldOffsetY: number = 0;

        // if current person exist
        if (currentPerson) {
            // center world around current person, the view should be centered on the person
            worldOffsetX = currentPerson.x - (this.state.width / 2);
            worldOffsetY = currentPerson.y - (this.state.height / 2);
        }

        return (
            <div className="persons">
                <h1>Multiplayer Room</h1>
                <p>Use the left and right arrow keys or WASD keys to move the player left and right within the room.</p>
                <PersonsLogin loginSuccess={this.handleLoginSuccess} ref={this.loginRef}/>
                <div>
                    <button onClick={this.beginLogin}>Login</button>
                </div>
                <svg className="game" width={this.state.width} height={this.state.height} style={{border: "1px solid black"}}>
                    <defs>
                        {
                            this.state.rooms.map((room: IRoom, index: number) => {
                                const {x, y} = room;
                                return (
                                    <mask key={`room-${index}`} id={`room-${index}`} x="0" y="0" width="500" height="300">
                                        <rect fill="white" x={x + 5} y={y - 200} width={490} height={495}/>
                                        {
                                            [ERoomWallType.DOOR, ERoomWallType.ENTRANCE].includes(room.doors.left) ?
                                                <>
                                                    <rect fill="white" x={x - 5} y={y - 200} width={10} height={400}/>
                                                    <rect fill="white" x={x - 105} y={y - 200} width={100} height={595}/>
                                                </> :
                                                null
                                        }
                                        {
                                            [ERoomWallType.DOOR, ERoomWallType.ENTRANCE].includes(room.doors.right) ?
                                                <>
                                                    <rect fill="white" x={x + 495} y={y - 200} width={10} height={400}/>
                                                    <rect fill="white" x={x + 505} y={y - 200} width={100} height={595}/>
                                                </> :
                                                null
                                        }
                                        {
                                            [ERoomWallType.DOOR, ERoomWallType.ENTRANCE].includes(room.doors.bottom) ?
                                                <rect fill="white" x={x + 200} y={y + 295} width={100} height={205}/> :
                                                room.doors.bottom === ERoomWallType.OPEN ?
                                                    <rect fill="white" x={x} y={y + 295} width={500} height={205}/> :
                                                    null
                                        }
                                    </mask>
                                );
                            })
                        }
                        {
                            this.state.cars.map((car: ICar) => {
                                const {x, y} = car;
                                return (
                                    <>
                                        <mask key={`car-${car.id}-down`} id={`car-${car.id}-down`} x="0" y="0" width="100" height="200">
                                            <rect fill="white" x={x - 50} y={y - 200} width={100} height={250}/>
                                            <rect fill="white" x={x - 100} y={y - 200} width={50} height={400}/>
                                            <rect fill="white" x={x + 50} y={y - 200} width={50} height={400}/>
                                        </mask>
                                        <mask key={`car-${car.id}-left`} id={`car-${car.id}-left`} x="0" y="0" width="200" height="100">
                                            <rect fill="white" x={x - 100} y={y - 200} width={200} height={250}/>
                                            <rect fill="white" x={x - 150} y={y - 200} width={50} height={400}/>
                                            <rect fill="white" x={x + 100} y={y - 200} width={50} height={400}/>
                                        </mask>
                                    </>
                                );
                            })
                        }
                        <pattern id="grass" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                            <image href="/grass.png" width="16" height="16"/>
                        </pattern>
                        <pattern id="road" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                            <image href="/road.png" width="16" height="16"/>
                        </pattern>
                        <pattern id="road-yellow" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                            <image href="/road-yellow.png" width="16" height="16"/>
                        </pattern>
                        <pattern id="road-white" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                            <image href="/road-white.png" width="16" height="16"/>
                        </pattern>
                    </defs>
                    <g transform={`translate(${-worldOffsetX},${-worldOffsetY})`}>
                        {
                            // draw the grass on the bottom of the world
                            this.generateGrassTile({
                                x: worldOffsetX,
                                y: worldOffsetY
                            }).map(({x, y}: IObject) => {
                                return <rect key={`grass-tile-${x}-${y}`} x={x} y={y} width="500" height="300" fill="url(#grass)"/>;
                            })
                        }
                        {
                            // draw a road
                            new Array(5 * 3).fill(0).map((v, i): IObject => ({
                                x: i * 500,
                                y: 1200
                            })).map(({x, y}) => {
                                return (
                                    <g key={`road-tile-${x}-${y}`} transform={`translate(${x}, ${y})`}>
                                        <rect x="0" y="0" width="500" height="300" fill="url(#road)"/>
                                        <rect x="0" y="135" width="500" height="10" fill="url(#road-yellow)"/>
                                        <rect x="0" y="155" width="500" height="10" fill="url(#road-yellow)"/>
                                        <rect x="0" y="0" width="500" height="10" fill="url(#road-white)"/>
                                        <rect x="0" y="290" width="500" height="10" fill="url(#road-white)"/>
                                    </g>
                                )
                            })
                        }
                        {
                            // draw persons, cars, and movable objects
                            this.sortDrawables().map(drawable => {
                                return drawable.draw();
                            })
                        }
                    </g>
                    <text x="20" y="20">Position: {worldOffsetX} {worldOffsetY}</text>
                    {
                        this.showWalkingTutorial() ? (
                            <g>
                                <text x="20" y="40" fill="black" opacity={0.5}>Press the WASD keys to walk.</text>
                                <text x="70" y="60" fill={this.state.tutorials.walking.w ? "blue" : "black"} opacity={0.5}>W</text>
                                <text x="20" y="110" fill={this.state.tutorials.walking.w ? "blue" : "black"} opacity={0.5}>A</text>
                                <text x="70" y="110" fill={this.state.tutorials.walking.w ? "blue" : "black"} opacity={0.5}>S</text>
                                <text x="120" y="110" fill={this.state.tutorials.walking.w ? "blue" : "black"} opacity={0.5}>D</text>
                            </g>
                        ) : null
                    }
                    {
                        this.showDrivingTutorial() ? (
                            <g>
                                <text x="20" y="40" fill="black">Press the E key to Enter and Exit the car.</text>
                            </g>
                        ) : null
                    }
                    {
                        this.showDrivingText() ? (
                            <g>
                                <text x="20" y="260" fill="black">Starter</text>
                            </g>
                        ) : null
                    }
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
