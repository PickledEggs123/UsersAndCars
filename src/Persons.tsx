import React from 'react';
import './App.scss';
import axios from "axios";
import {
    ECarDirection,
    ELotExpandType,
    ELotZone,
    ENetworkObjectType,
    ERoadDirection,
    ERoadType,
    ERoomWallType,
    IApiPersonsGetResponse,
    IApiPersonsPut,
    IApiPersonsVendPost,
    IApiPersonsVoiceAnswerMessage, IApiPersonsVoiceAnswerPost,
    IApiPersonsVoiceCandidateMessage,
    IApiPersonsVoiceCandidatePost,
    IApiPersonsVoiceOfferMessage,
    IApiPersonsVoiceOfferPost,
    ICar,
    ICity,
    IGameTutorials,
    IKeyDownHandler,
    ILot,
    ILotExpandTypeAndAffectedLocations,
    INetworkObject,
    IObject,
    IPerson,
    IRoad,
    IRoom,
    IVendor,
    IVendorInventoryItem,
    IWhichDirectionIsNearby
} from "./types/GameTypes";
import {PersonsLogin} from "./PersonsLogin";
import {IPersonsDrawablesProps, IPersonsDrawablesState, PersonsDrawables} from "./PersonsDrawables";
import {applyAudioFilters, rtcPeerConnectionConfiguration, userMediaConfig} from "./config";

/**
 * The input to the [[Persons]] component that changes how the game is rendered.
 */
interface IPersonsProps extends IPersonsDrawablesProps {}

/**
 * The state of the game component. The game state is stored in React so all changes to the game state will update the
 * SVG on the screen.
 */
interface IPersonsState extends IPersonsDrawablesState {
    /**
     * The tutorials that should be shown.
     */
    tutorials: IGameTutorials;
    /**
     * The timestamp of the last network update. Used to prevent the backward teleporting glitch when moving. If the
     * local update is newer than the last network update, the local update will replace the network update. This
     * allows the player to move smoothly across the screen without the network update resetting the player's position
     * to a previous position.
     */
    lastUpdate: string;
    /**
     * A list of nearest persons for voice audio chat.
     */
    nearestPersons: string[];
}

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
 * Data structure for storing all audio chat information per peer.
 */
interface IAudioChatPeerData {
    peerConnection: RTCPeerConnection;
    ref: React.RefObject<HTMLAudioElement>;
    senders: RTCRtpSender[];
}

/**
 * A React Component which renders the Persons game.
 */
export class Persons extends PersonsDrawables<IPersonsProps, IPersonsState> {
    /**
     * The interval containing the game loop.
     */
    intervalGameLoop: any = null;

    /**
     * The interval containing the animation loop.
     */
    intervalAnimationLoop: any = null;

    /**
     * The timeout containing the animation loop
     */
    timeoutAnimationLoop: any = null;

    /**
     * The animation refresh rate. It is in milliseconds.
     */
    animationRefreshRate: number = 200;

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
    heartbeatRefreshSpeed: number = 20000;

    /**
     * The reference to the login component.
     */
    loginRef = React.createRef<PersonsLogin>();

    /**
     * Data for each audio chat peer.
     */
    audioChatPeerData: {[id: string]: IAudioChatPeerData} = {};

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
            driving: true,
            grabbing: true
        },
        persons: [] as IPerson[],
        rooms: [] as IRoom[],
        cars: [] as ICar[],
        objects: [] as INetworkObject[],
        roads: [] as IRoad[],
        lots: [] as ILot[],
        previousNetworkObjects: {
            persons: [] as IPerson[],
            cars: [] as ICar[],
            objects: [] as INetworkObject[],
            fetchTime: new Date()
        },
        nearbyObjects: [] as INetworkObject[],
        currentPersonId: this.randomPersonId(),
        lastUpdate: new Date().toISOString(),
        fetchTime: new Date(),
        vendingInventory: [] as IVendorInventoryItem[],
        nearestPersons: [] as string[],
        connectedVoiceChats: [] as string[]
    };

    /**
     * Setup the game.
     */
    componentDidMount(): void {
        this.beginGameLoop();
    }

    componentDidUpdate(prevProps: Readonly<IPersonsProps>, prevState: Readonly<IPersonsState>, snapshot?: any): void {
        // audio stream changed
        if (prevState.nearestPersons !== this.state.nearestPersons) {
            const createVoiceChatWithPersons = this.state.nearestPersons.filter(newNearestPerson => !prevState.nearestPersons.includes(newNearestPerson));
            const endingVoiceChatWithPersons = prevState.nearestPersons.filter(oldNearestPerson => !this.state.nearestPersons.includes(oldNearestPerson));

            // create voice chat with people who are now within range
            createVoiceChatWithPersons.forEach(personId => {
                (async () => {
                    // if statement is used so one person will offer to the other and the other person will answer.
                    // the voice chat handshake must happen in a predetermined direction.
                    if (personId < this.state.currentPersonId) {
                        // begin offer of voice chat to other person
                        this.audioChatPeerData[personId] = await this.createVoiceChatChannelForPerson(personId);
                        console.log("VOICE CHAT WITH", personId, "STARTED");
                        this.forceUpdate();
                    }
                })().catch((err) => {
                    console.log(err);
                });
            });

            // end voice chat with people who are out of range
            endingVoiceChatWithPersons.forEach(personId => {
                const peerData = this.audioChatPeerData[personId];
                if (peerData) {
                    peerData.senders.forEach(sender => {
                        peerData.peerConnection.removeTrack(sender);
                    });
                    peerData.peerConnection.close();
                    delete this.audioChatPeerData[personId];
                    console.log("VOICE CHAT WITH", personId, "ENDED");
                }
            });
        }
    }

    /**
     * Stop the game.
     */
    componentWillUnmount(): void {
        this.endGameLoop();
    }

    /**
     * Add all connection handlers for a peer connection.
     * @param peerConnection The peer connection to modify.
     * @param personId The person id the peer connection is for.
     * @param peerData The peer data containing the peer connection.
     */
    addPeerConnectionHandlers = (peerConnection: RTCPeerConnection, personId: string, peerData: IAudioChatPeerData) => {
        peerConnection.onicecandidate = (event) => {
            const {candidate} = event;
            const data: IApiPersonsVoiceCandidatePost = {
                from: this.state.currentPersonId,
                to: personId,
                candidate
            };
            axios.post("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/voice/candidate", data).catch((err) => {
                console.log(err);
            });
            console.log("ICE Candidate", candidate);
        };

        peerConnection.ontrack = (event) => {
            // get new track
            const newTrack = event.track;

            // find stream containing new track, the remote stream, not the local stream
            const stream = event.streams.find(s => {
                return !!s.getTrackById(newTrack.id);
            });

            // if found stream
            if (stream) {
                // find audio element
                const audioElement: HTMLAudioElement | null = peerData.ref.current;
                if (audioElement) {
                    // apply stream to audio element
                    audioElement.srcObject = stream;
                }
            }
        };

        peerConnection.onnegotiationneeded = () => {
            (async () => {
                const localDescription = await peerConnection.createOffer({offerToReceiveAudio: true, offerToReceiveVideo: false, voiceActivityDetection: false});
                await peerConnection.setLocalDescription(localDescription);
                const data: IApiPersonsVoiceOfferPost = {
                    from: this.state.currentPersonId,
                    to: personId,
                    description: peerConnection.localDescription
                };
                await axios.post("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/voice/offer", data);
            })().catch((err) => {
                console.log(err);
            });
        };

        peerConnection.onconnectionstatechange = () => {
            console.log("Connection State", personId, peerConnection.connectionState);
            if (peerConnection.connectionState === "connected") {
                // now connected with that person, add them to list of connected voice chats
                this.setState({
                    connectedVoiceChats: [
                        ...this.state.connectedVoiceChats,
                        personId
                    ]
                });
            } else {
                // not connected to that person, remove them from the list of connected voice chats
                this.setState({
                    connectedVoiceChats: this.state.connectedVoiceChats.filter(id => id !== personId)
                });
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log("ICE Connection State", personId, peerConnection.iceConnectionState);
        };

        peerConnection.onicegatheringstatechange = () => {
            console.log("ICE Gathering State", personId, peerConnection.iceGatheringState);
        };

        peerConnection.onicecandidateerror = (event) => {
            console.log("ICE Candidate Error", personId, event.errorText);
        };
    };

    /**
     * Begin the voice chat loop.
     */
    createVoiceChatChannelForPerson = async (personId: string): Promise<IAudioChatPeerData> => {
        // voice chat connection
        const peerConnection: RTCPeerConnection = new RTCPeerConnection(rtcPeerConnectionConfiguration);

        // data for the audio chat channel
        const peerData: IAudioChatPeerData = {
            peerConnection,
            senders: [],
            ref: React.createRef<HTMLAudioElement>()
        };
        this.addPeerConnectionHandlers(peerConnection, personId, peerData);

        // request voice permission
        const stream = await navigator.mediaDevices.getUserMedia(userMediaConfig);
        applyAudioFilters(stream);

        // add local voice audio tracks to peer connection
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach(audioTrack => {
            peerData.senders = [
                ...peerData.senders,
                peerConnection.addTrack(audioTrack, stream)
            ];
        });

        return peerData;
    };

    /**
     * Handle the WebRTC voice chat candidate message.
     * @param message The candidate message.
     */
    handleVoiceCandidateMessage = (message: IApiPersonsVoiceCandidateMessage) => {
        const {from, candidate} = message;
        const peerData = this.audioChatPeerData[from];
        if (peerData) {
            peerData.peerConnection.addIceCandidate(candidate).catch((err) => {
                console.log(err);
            });
        }
    };

    /**
     * Handle the WebRTC voice chat candidate message.
     * @param message The candidate message.
     */
    handleVoiceOfferMessage = (message: IApiPersonsVoiceOfferMessage) => {
        const {from, description} = message;
        (async () => {
            // create new peer connection
            const peerConnection: RTCPeerConnection = new RTCPeerConnection(rtcPeerConnectionConfiguration);
            const peerData: IAudioChatPeerData = {
                peerConnection,
                senders: [],
                ref: React.createRef<HTMLAudioElement>()
            };
            this.addPeerConnectionHandlers(peerConnection, from, peerData);

            // set offer remote description
            await peerConnection.setRemoteDescription(description);

            // load audio stream into peer connection
            const stream = await navigator.mediaDevices.getUserMedia(userMediaConfig);
            applyAudioFilters(stream);
            stream.getAudioTracks().forEach(audioTrack => {
                peerData.senders = [
                    ...peerData.senders,
                    peerConnection.addTrack(audioTrack, stream)
                ];
            });
            this.audioChatPeerData[from] = peerData;
            const localDescription = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(localDescription);

            // send answer response back to original person
            const data: IApiPersonsVoiceAnswerPost = {
                from: this.state.currentPersonId,
                to: from,
                description: peerConnection.localDescription
            };
            await axios.post("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/voice/answer", data);
        })().catch((err) => {
            console.log(err);
        });
    };

    /**
     * Handle the WebRTC voice chat candidate message.
     * @param message The candidate message.
     */
    handleVoiceAnswerMessage = (message: IApiPersonsVoiceAnswerMessage) => {
        const {from, description} = message;
        const peerData = this.audioChatPeerData[from];
        if (peerData) {
            peerData.peerConnection.setRemoteDescription(description).catch((err) => {
                console.log(err);
            });
        }
    };

    /**
     * Create a new item in the game world by buying it.
     * @param inventoryItem The item to buy.
     */
    vendInventoryItem = (inventoryItem: IVendorInventoryItem) => {
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            const personId = currentPerson.id;
            const data: IApiPersonsVendPost = {
                ...inventoryItem,
                personId
            };
            axios.post("https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/vend", data).then(() => {
                this.setState({vendingInventory: []});
            }).catch((err) => console.log(err));
        }
    };

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
            doors: {
                left: ERoomWallType.WALL,
                right: ERoomWallType.WALL,
                top: ERoomWallType.WALL,
                bottom: ERoomWallType.WALL
            }
        };
    };

    /**
     * Generate a hallway.
     * @param id The id of the hallway
     * @param x The x position of the hallway.
     * @param y The y position of the hallway.
     */
    generateHallway = ({id, x, y}: {id: string, x: number, y: number}): IRoom => {
        return {
            id,
            x,
            y,
            doors: {
                left: ERoomWallType.WALL,
                right: ERoomWallType.WALL,
                top: ERoomWallType.WALL,
                bottom: ERoomWallType.WALL
            }
        };
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
            doors: {
                left: ERoomWallType.OPEN,
                right: ERoomWallType.OPEN,
                top: ERoomWallType.OPEN,
                bottom: ERoomWallType.OPEN
            }
        };
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
    tileIsNearbyTile = (a: IObject) => (b: IObject) => {
        return b.x >= a.x - 500 && b.x <= a.x + 500 && b.y >= a.y - 300 && b.y <= a.y + 300;
    };

    /**
     * Return which doors should be open given a room and an array of nearby rooms.
     * @param tile The room which doors should be computed.
     * @param nearbyTiles The array of nearby rooms.
     */
    whichDirectionIsNearby = (tile: IObject, nearbyTiles: IObject[]): IWhichDirectionIsNearby => {
        const up = nearbyTiles.some((nearbyTile) => {
            return Math.abs(nearbyTile.x - tile.x) < 10 && Math.abs(nearbyTile.y - tile.y + 300) < 10;
        });
        const down = nearbyTiles.some((nearbyTile) => {
            return Math.abs(nearbyTile.x - tile.x) < 10 && Math.abs(nearbyTile.y - tile.y - 300) < 10;
        });
        const left = nearbyTiles.some((nearbyTile) => {
            return Math.abs(nearbyTile.y - tile.y) < 10 && Math.abs(nearbyTile.x - tile.x + 500) < 10;
        });
        const right = nearbyTiles.some((nearbyTile) => {
            return Math.abs(nearbyTile.y - tile.y) < 10 && Math.abs(nearbyTile.x - tile.x - 500) < 10;
        });

        return {
            up,
            down,
            left,
            right
        } as IWhichDirectionIsNearby;
    };

    /**
     * Apply doors onto the room mutably.
     * @param room The room which should be modified with new doors.
     * @param whichDoorsShouldBeOpen The doors to open.
     * @param value The type of wall to be drawn.
     */
    applyWhichDoorsShouldBeOpen = (room: IRoom, whichDoorsShouldBeOpen: IWhichDirectionIsNearby, value: ERoomWallType): void => {
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
     * Apply doors onto the room mutably.
     * @param road The room which should be modified with new doors.
     * @param whichDoorsShouldBeOpen The doors to open.
     */
    applyRoadConnections = (road: IRoad, whichDoorsShouldBeOpen: IWhichDirectionIsNearby): void => {
        road.connected = {
            ...road.connected,
            ...whichDoorsShouldBeOpen
        };
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
                const nearbyRooms = hallways.filter(this.tileIsNearbyTile(hallway));
                const whichDoorsShouldBeOpen = this.whichDirectionIsNearby(hallway, nearbyRooms);
                this.applyWhichDoorsShouldBeOpen(hallway, whichDoorsShouldBeOpen, ERoomWallType.OPEN);
            }
            {
                // find nearby rooms that are not hallways, make door
                const nearbyRooms = notHallways.filter(this.tileIsNearbyTile(hallway));
                const whichDoorsShouldBeOpen = this.whichDirectionIsNearby(hallway, nearbyRooms);
                this.applyWhichDoorsShouldBeOpen(hallway, whichDoorsShouldBeOpen, ERoomWallType.DOOR);
            }
        });

        // build doors from offices to hallways
        const offices = rooms.filter(room => room.id.includes("office"));
        offices.forEach(office => {
            // find nearby hallways, add door
            const nearbyRooms = hallways.filter(this.tileIsNearbyTile(office));
            const whichDoorsShouldBeOpen = this.whichDirectionIsNearby(office, nearbyRooms);
            this.applyWhichDoorsShouldBeOpen(office, whichDoorsShouldBeOpen, ERoomWallType.DOOR);
        });

        // build doors from entrances to hallways
        const entrances = rooms.filter(room => room.id.includes("entrance"));
        entrances.forEach(entrance => {
            // find nearby hallways, add door
            const nearbyRooms = hallways.filter(this.tileIsNearbyTile(entrance));
            const whichDoorsShouldBeOpen = this.whichDirectionIsNearby(entrance, nearbyRooms);
            this.applyWhichDoorsShouldBeOpen(entrance, whichDoorsShouldBeOpen, ERoomWallType.ENTRANCE);
        });

        return rooms;
    };

    /**
     * Generate roads for a city.
     * @param format A string containing an ASCII map of the city.
     * @param x The offset of the city.
     * @param y The offset of the city.
     */
    generateRoads = ({format, offset: {x, y}}: {format: string, offset: IObject}): IRoad[] => {
        const roads = [] as IRoad[];

        // parse all roads
        const rows = format.split(/\r\n|\r|\n/);
        rows.forEach((row, rowIndex) => {
            const tiles = row.split("");
            tiles.forEach((tile, columnIndex) => {
                switch (tile) {
                    case "|": {
                        roads.push({
                            x: x + columnIndex * 500,
                            y: y + rowIndex * 300,
                            type: ERoadType.TWO_LANE,
                            direction: ERoadDirection.VERTICAL,
                            connected: {
                                up: false,
                                down: false,
                                left: false,
                                right: false
                            }
                        });
                        break;
                    }
                    case "-": {
                        roads.push({
                            x: columnIndex * 500,
                            y: rowIndex * 300,
                            type: ERoadType.TWO_LANE,
                            direction: ERoadDirection.HORIZONTAL,
                            connected: {
                                up: false,
                                down: false,
                                left: false,
                                right: false
                            }
                        });
                        break;
                    }
                }
            });
        });

        // connect roads to each other
        roads.forEach(road => {
            const nearbyRoads = roads.filter(this.tileIsNearbyTile(road));
            const whichDirectionShouldBeConnected = this.whichDirectionIsNearby(road, nearbyRoads);
            this.applyRoadConnections(road, whichDirectionShouldBeConnected);
        });

        return roads;
    };

    /**
     * Lot is at location and zone matches.
     * @param location The location to check.
     * @param zone The zone of the located lot.
     */
    lotAtLocation = (location: IObject, zone: ELotZone) => (lot: ILot): boolean => {
        return Math.abs(lot.x - location.x) <= 10 && Math.abs(lot.y - location.y) <= 10 && lot.zone === zone;
    };

    /**
     * Determine the type of lot expansion to perform.
     * @param lot The lot to check.
     * @param lots The lots to expand into.
     */
    getLotExpandTypeAndAffectedLocations = (lot: ILot, lots: ILot[]): ILotExpandTypeAndAffectedLocations => {
        // the tile position of the lot
        const lotXInTiles = Math.round(lot.x / 500);
        const lotYInTiles = Math.round(lot.y / 300);
        // the lot width and height in tiles
        const lotWidthInTiles = Math.round(lot.width / 500);
        const lotHeightInTitles = Math.round(lot.height / 300);

        // a line on the right side of the square, lot can expand into the right row
        const rightLocations = new Array(lotHeightInTitles).fill(0).map((v, i): IObject => ({
            x: (lotXInTiles + lotWidthInTiles) * 500,
            y: (lotYInTiles + i) * 300
        }));
        // a line on the bottom of the square, lot can expand into the bottom row
        const bottomLocations = new Array(lotWidthInTiles).fill(0).map((v, i): IObject => ({
            x: (lotXInTiles + i) * 500,
            y: (lotYInTiles + lotHeightInTitles) * 300
        }));
        // a corner square, lot can expand into both right and bottom if the corner is filled
        const cornerLocation: IObject = {
            x: (lotXInTiles + lotWidthInTiles) * 500,
            y: (lotYInTiles + lotHeightInTitles) * 300
        };

        // determine if positions are filled
        const isRightFilled = rightLocations.every(location => {
            return lots.some(this.lotAtLocation(location, lot.zone));
        });
        const isBottomFilled = bottomLocations.every(location => {
            return lots.some(this.lotAtLocation(location, lot.zone));
        });
        const isCornerFilled = lots.some(this.lotAtLocation(cornerLocation, lot.zone));

        // depending on which tile positions are filled
        if (isRightFilled && isBottomFilled && isCornerFilled) {
            // return bottom and right affected lots
            return {
                lotExpandType: ELotExpandType.RIGHT_AND_BOTTOM,
                affectedLots: [
                    ...rightLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                        const l = lots.find(this.lotAtLocation(location, lot.zone));
                        if (l) {
                            return [...arr, l];
                        } else {
                            return arr;
                        }
                    }, []),
                    ...bottomLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                        const l = lots.find(this.lotAtLocation(location, lot.zone));
                        if (l) {
                            return [...arr, l];
                        } else {
                            return arr;
                        }
                    }, []),
                    ...lots.filter(this.lotAtLocation(cornerLocation, lot.zone))
                ]
            };
        } else if (isRightFilled) {
            // return right affected lots
            return {
                lotExpandType: ELotExpandType.RIGHT,
                affectedLots: [
                    ...rightLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                        const l = lots.find(this.lotAtLocation(location, lot.zone));
                        if (l) {
                            return [...arr, l];
                        } else {
                            return arr;
                        }
                    }, [])
                ]
            };
        } else if (isBottomFilled) {
            // return bottom affected lots
            return {
                lotExpandType: ELotExpandType.BOTTOM,
                affectedLots: [
                    ...bottomLocations.reduce((arr: ILot[], location: IObject): ILot[] => {
                        const l = lots.find(this.lotAtLocation(location, lot.zone));
                        if (l) {
                            return [...arr, l];
                        } else {
                            return arr;
                        }
                    }, [])
                ]
            };
        } else {
            return {
                lotExpandType: ELotExpandType.NONE,
                affectedLots: []
            };
        }
    };

    lotFillers: ILotFiller[] = [{
        width: 2500,
        height: 1200,
        zone: ELotZone.RESIDENTIAL,
        fillLot(lot: ILot): ILotFillerLotAndObjects {
            return {
                lot: {
                    ...lot,
                    format: "" +
                        "  E  \n" +
                        "OHHO \n" +
                        "OHOH \n" +
                        " E   "
                },
                objects: []
            };
        }
    }, {
        width: 2500,
        height: 900,
        zone: ELotZone.RESIDENTIAL,
        fillLot(lot: ILot): ILotFillerLotAndObjects {
            return {
                lot: {
                    ...lot,
                    format: "" +
                        "OE EO\n" +
                        "HH HH\n" +
                        "OE EO"
                },
                objects: []
            };
        }
    }, {
        width: 2500,
        height: 1200,
        zone: ELotZone.COMMERCIAL,
        fillLot(lot: ILot): ILotFillerLotAndObjects {
            return {
                lot: {
                    ...lot,
                    format: "" +
                        "  E  \n" +
                        "OHHHH\n" +
                        "OHHHH\n" +
                        "  E  "
                },
                objects: [{
                    x: lot.x + 1250,
                    y: lot.y + 600,
                    objectType: ENetworkObjectType.VENDING_MACHINE,
                    grabbedByPersonId: null,
                    id: `lot-${lot.x}-${lot.y}-vending-machine`,
                    lastUpdate: new Date().toISOString(),
                    inventory: [{
                        price: 3000,
                        objectType: ENetworkObjectType.CAR
                    }, {
                        price: 10,
                        objectType: ENetworkObjectType.BOX
                    }]
                } as IVendor] as INetworkObject[]
            };
        }
    }, {
        width: 2500,
        height: 900,
        zone: ELotZone.COMMERCIAL,
        fillLot(lot: ILot): ILotFillerLotAndObjects {
            return {
                lot: {
                    ...lot,
                    format: "" +
                        "  E  \n" +
                        "OHHHO\n" +
                        "  E  "
                },
                objects: []
            };
        }
    }];

    /**
     * Fill a lot with rooms.
     * @param lot The lot to fill.
     */
    fillLot = (lot: ILot): ILotFillerLotAndObjects => {
        const lotFiller = this.lotFillers.find(l => l.width === lot.width && l.height === lot.height && l.zone === lot.zone);
        if (lotFiller) {
            return lotFiller.fillLot(lot);
        } else {
            return {
                lot,
                objects: [] as INetworkObject[]
            };
        }
    };

    /**
     * Generate a city from an ASCII map.
     * @param prefix The name of the city. It's prepended to the [[ILot]] names.
     * @param format The ASCII map of the city.
     * @param x The x offset of the city.
     * @param y The y offset of the city.
     */
    generateCity = ({prefix, format, offset: {x, y}}: {prefix: string, format: string, offset: IObject}): ICity => {
        format = "" +
            "|-----|---------------|-----|---------------|-----|\n" +
            "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
            "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
            "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
            "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
            "|-----|---------------|-----|---------------|-----|\n" +
            "|CCCCC|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|CCCCC|\n" +
            "|CCCCC|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|CCCCC|\n" +
            "|CCCCC|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|CCCCC|\n" +
            "|-----|---------------|-----|---------------|-----|\n" +
            "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
            "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
            "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
            "|RRRRR|RRRRRRRRRRRRRRR|CCCCC|RRRRRRRRRRRRRRR|RRRRR|\n" +
            "|-----|---------------|-----|---------------|-----|";

        const roads = this.generateRoads({format, offset: {x, y}});
        let lots = [] as ILot[];

        // generate a lot for each zoning character
        const rows = format.split(/\r\n|\r|\n/);
        rows.forEach((row, rowIndex) => {
            const zones = row.split("");
            zones.forEach((zone, columnIndex) => {
                switch (zone) {
                    case "R": {
                        const lot: ILot = {
                            owner: null,
                            format: null,
                            width: 500,
                            height: 300,
                            x: x + columnIndex * 500,
                            y: y + rowIndex * 300,
                            zone: ELotZone.RESIDENTIAL
                        };
                        lots.push(lot);
                        break;
                    }
                    case "C": {
                        const lot: ILot = {
                            owner: null,
                            format: null,
                            width: 500,
                            height: 300,
                            x: x + columnIndex * 500,
                            y: y + rowIndex * 300,
                            zone: ELotZone.COMMERCIAL
                        };
                        lots.push(lot);
                        break;
                    }
                }
            });
        });

        // merge lots into their neighbors
        for (let i = 0; i < lots.length; i++) {
            const firstLot = lots[i];
            let exitLoop = false;
            for (let depth = 1; depth < 5 && !exitLoop; depth++) {
                const {affectedLots, lotExpandType} = this.getLotExpandTypeAndAffectedLocations(firstLot, lots);
                switch (lotExpandType) {
                    case ELotExpandType.RIGHT_AND_BOTTOM: {
                        // expand lot both right and bottom
                        firstLot.width += 500;
                        firstLot.height += 300;
                        break;
                    }
                    case ELotExpandType.RIGHT: {
                        // expand lot to the right
                        firstLot.width += 500;
                        break;
                    }
                    case ELotExpandType.BOTTOM: {
                        // expand lot to the bottom
                        firstLot.height += 300;
                        break;
                    }
                    case ELotExpandType.NONE: {
                        exitLoop = true;
                        break;
                    }
                }

                // remove affected lots
                lots = lots.filter(lot => !affectedLots.some(this.lotAtLocation(lot, firstLot.zone)));
            }
        }

        // generate rooms and objects per lot
        const lotAndObjects = lots.map(this.fillLot);

        // merge into two lists
        const lotAndObjectsMerge = lotAndObjects.reduce(({lotArr, objectsArr}: {lotArr: ILot[], objectsArr: INetworkObject[]}, lotAndObjectsItem): {lotArr: ILot[], objectsArr: INetworkObject[]} => {
            return {
                lotArr: [...lotArr, lotAndObjectsItem.lot],
                objectsArr: [...objectsArr, ...lotAndObjectsItem.objects]
            };
        }, {
            lotArr: [],
            objectsArr: []
        });
        lots = lotAndObjectsMerge.lotArr;
        const objects = lotAndObjectsMerge.objectsArr;

        return {
            roads,
            lots,
            objects
        };
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
     * If the grabbing tutorial should be shown.
     */
    showGrabbingTutorial = () => {
        return this.state.nearbyObjects.length > 0 && this.state.tutorials.grabbing;
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

        // generate roads and lots
        const {roads, lots, objects} = this.generateCity({prefix: "city1", format: "", offset: {x: 0, y: 0}});

        // generate houses
        const rooms = lots.reduce((arr: IRoom[], lot: ILot, index: number): IRoom[] => {
            const {x, y, format} = lot;
            if (format) {
                return [
                    ...arr,
                    ...this.generateHouse({
                        prefix: `house-${index}`,
                        format,
                        offset: {
                            x,
                            y
                        }
                    })
                ];
            } else {
                return arr;
            }
        }, []);

        this.setState({
            rooms,
            roads,
            lots,
            objects
        });

        // begin animation loop
        this.intervalAnimationLoop = requestAnimationFrame(this.animationLoop);
    };

    /**
     * Animate the React scene.
     */
    animationLoop = () => {
        // animation begun, clear animation loop interval, cannot cancel the loop now
        this.intervalAnimationLoop = null;

        // force react to update, creating the animation. The objects will move across the screen due to network interpolation.
        this.forceUpdate(() => {
            // react render is done, request another animation frame
            this.timeoutAnimationLoop = setTimeout(() => {
                // set timeout cannot be cleared now, it started.
                this.timeoutAnimationLoop = null;

                this.intervalAnimationLoop = requestAnimationFrame(this.animationLoop);
            }, this.animationRefreshRate);
        });
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

        // stop animation loop
        if (this.intervalAnimationLoop) {
            cancelAnimationFrame(this.intervalAnimationLoop);
            this.intervalAnimationLoop = null;
        }
        if (this.timeoutAnimationLoop) {
            clearTimeout(this.timeoutAnimationLoop);
            this.timeoutAnimationLoop = null;
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
        // get list of persons, cars and objects that have changed
        const personsToUpdate = this.state.persons.filter(person => +Date.parse(this.state.lastUpdate) < +Date.parse(person.lastUpdate));
        const carsToUpdate = this.state.cars.filter(car => +Date.parse(this.state.lastUpdate) < +Date.parse(car.lastUpdate));
        const objectsToUpdate = this.state.objects.filter(networkObject => +Date.parse(this.state.lastUpdate) < +Date.parse(networkObject.lastUpdate));
        // update all changed persons, cars and objects
        await this.updateGame({
            persons: personsToUpdate,
            cars: carsToUpdate,
            objects: objectsToUpdate
        });

        // get a list of persons from the database
        const getRequestUrlSearchParams = new URLSearchParams();
        getRequestUrlSearchParams.append("id", this.state.currentPersonId);
        const response = await axios.get<IApiPersonsGetResponse>(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/data?${getRequestUrlSearchParams}`);
        if (response && response.data) {
            // get persons data from the server
            const {
                persons: serverPersons,
                cars: serverCars,
                objects: serverObjects,
                voiceMessages: {
                    candidates,
                    offers,
                    answers
                }
            } = response.data;

            // handle voice metadata messages
            candidates.forEach(this.handleVoiceCandidateMessage);
            offers.forEach(this.handleVoiceOfferMessage);
            answers.forEach(this.handleVoiceAnswerMessage);

            // record the current fetch time of the data. Used for interplating the drawings of networked objects.
            const fetchTime = new Date();

            // modify server data with local data, pick most up to date version of the data
            const persons = serverPersons.reduce((arr: IPerson[], person: IPerson): IPerson[] => {
                return this.updateMergeLocalAndNetworkData(this.state.persons, arr, person);
            }, []);
            const cars = serverCars.reduce((arr: ICar[], car: ICar): ICar[] => {
                return this.updateMergeLocalAndNetworkData(this.state.cars, arr, car);
            }, []);
            const objects = serverObjects.reduce((arr: INetworkObject[], networkObject: INetworkObject): INetworkObject[] => {
                return this.updateMergeLocalAndNetworkData(this.state.objects, arr, networkObject);
            }, []);
            const newCurrentPerson = persons.find(person => person.id === this.state.currentPersonId);
            const nearbyObjects = this.getNearbyObjects(newCurrentPerson, objects);
            const nearestPersons = this.getCurrentPerson() ?
                persons.filter(person => person.id !== this.state.currentPersonId).slice(0, 10).map(person => person.id) :
                [];
            this.setState({
                persons,
                cars,
                objects,
                nearbyObjects,
                lastUpdate: new Date().toISOString(),
                fetchTime,
                previousNetworkObjects: {
                    persons: this.state.persons,
                    cars: this.state.cars,
                    objects: this.state.objects,
                    fetchTime: this.state.fetchTime
                },
                nearestPersons
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
     * Get the passengers in the current car.
     */
    getCurrentCarPassengers = (): IPerson[] => {
        // get all passengers in the car with the current person
        const passengers = [] as IPerson[];
        const currentPerson = this.getCurrentPerson();
        if (currentPerson && currentPerson.carId) {
            const currentCar = this.state.cars.find(car => car.id === currentPerson.carId);
            if (currentCar) {
                passengers.push(...this.state.persons.filter(person => currentPerson && person.carId === currentCar.id && person.id !== currentPerson.id));
            }
        }

        return passengers;
    };

    /**
     * Update current person and car passengers in the person array. Return the array to save as a new React state.
     * @param update The update to perform on current person and car passengers.
     */
    updatePersons = (update: (person: IPerson, car?: ICar) => IPerson): IPerson[] => {
        const passengers = this.getCurrentCarPassengers();

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
     * Update the objects array immutably.
     * @param selectedObject The object to update.
     * @param update The update to apply on the object.
     */
    updateSelectedObject = (selectedObject: INetworkObject, update: (networkObject: INetworkObject) => INetworkObject): INetworkObject[] => {
        return this.state.objects.reduce((arr: INetworkObject[], networkObject: INetworkObject): INetworkObject[] => {
            // if the object is the selected object
            if (networkObject.id === selectedObject.id) {
                // id match, update that object in the array
                return [
                    ...arr,
                    {
                        ...update(networkObject),
                        lastUpdate: new Date().toISOString()
                    }
                ];
            } else {
                // do nothing
                return [...arr, networkObject];
            }
        }, []);
    };

    /**
     * Update the currently selected objects in objects array immutably.
     * @param update The update to apply on the object.
     */
    updateCurrentObjects = (update: (networkObject: INetworkObject, car?: ICar) => INetworkObject): INetworkObject[] => {
        // get the current person, need current person to grab onto current objects
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            // get the current car
            const car = this.state.cars.find(car => car.id === currentPerson.carId);
            // get a list of passengers in the car with the current person
            const passengers = this.getCurrentCarPassengers();

            // for each object
            return this.state.objects.reduce((arr: INetworkObject[], networkObject: INetworkObject): INetworkObject[] => {
                // if the object is grabbed by the current person or passenger in car with current person
                if (networkObject.grabbedByPersonId && [currentPerson.id, ...passengers.map(passenger => passenger.id)].includes(networkObject.grabbedByPersonId)) {
                    // id match, update that object in the array
                    return [
                        ...arr,
                        {
                            ...update(networkObject, car),
                            lastUpdate: new Date().toISOString()
                        }
                    ];
                } else {
                    // do nothing
                    return [...arr, networkObject];
                }
            }, []);
        } else {
            // no person to hold objects, do nothing
            return this.state.objects;
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
        updatePerson: (person: IObject, car?: ICar) => IObject,
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
                    const persons = this.updatePersons(updatePerson as any);
                    stateUpdates.push({persons});

                    // update objects grabbed by person or passengers
                    const objects = this.updateCurrentObjects(updatePerson as any);
                    stateUpdates.push({objects});

                    // update car array
                    const cars = this.updateCurrentCar(updateCar as any);
                    stateUpdates.push({cars});

                    // get new current person and use new current person to find new nearby objects
                    const newCurrentPerson = persons.find(person => person.id === this.state.currentPersonId);
                    const nearbyObjects = this.getNearbyObjects(newCurrentPerson, objects);
                    stateUpdates.push({nearbyObjects});
                } else {
                    // update objects grabbed by person
                    const objects = this.updateCurrentObjects(updatePerson as any);
                    stateUpdates.push({objects});

                    // update person array
                    const persons = this.updatePersons(updatePerson as any);
                    stateUpdates.push({persons});

                    // get new current person and use new current person to find new nearby objects
                    const newCurrentPerson = persons.find(person => person.id === this.state.currentPersonId);
                    const nearbyObjects = this.getNearbyObjects(newCurrentPerson, objects);
                    stateUpdates.push({nearbyObjects});
                }

                // close vending inventory list
                stateUpdates.push({vendingInventory: []});

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
     * Handle a property change on the selected object.
     * @param networkObject The selected object.
     * @param update The property change.
     */
    handleSelectedObjectPropertyChange = (networkObject: INetworkObject, update: (networkObject: INetworkObject) => INetworkObject) => {
        const objects = this.updateSelectedObject(networkObject, update);
        this.setState({objects});
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
     * Get a list of nearby objects.
     * @param currentPerson Optional current person, used to pass a new copy that is not in state.
     * @param objects Optional objects array, used to pass a new copy that is not in state.
     */
    getNearbyObjects = (currentPerson?: IPerson, objects?: INetworkObject[]): INetworkObject[] => {
        // no current person given
        if (!currentPerson) {
            // find current person
            currentPerson = this.getCurrentPerson();
        }

        // nearby objects depend on current person
        if (currentPerson) {
            // there is a current person, find objects nearby current person
            return (objects ? objects : this.state.objects).filter(this.objectNearby(currentPerson));
        } else {
            // there is no current person, there are no objects nearby
            return [];
        }
    };

    /**
     * Get a list of grabbed objects.
     */
    getGrabbedObjects = (): INetworkObject[] => {
        // depending on if there is a current person
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            // there is a current person, find selected objects
            return this.state.objects.filter(networkObject => networkObject.grabbedByPersonId === currentPerson.id);
        } else {
            // there is no current person, there are no objects selected
            return [];
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
                this.handleKeyDownMovementPerson(event, currentPerson)((person: IObject, car?: ICar): IObject => {
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
                this.handleKeyDownMovementPerson(event, currentPerson)((person: IObject, car?: ICar): IObject => {
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
                this.handleKeyDownMovementPerson(event, currentPerson)((person: IObject, car?: ICar): IObject => {
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
                this.handleKeyDownMovementPerson(event, currentPerson)((person: IObject, car?: ICar): IObject => {
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
            case "g": {
                const currentPerson = this.getCurrentPerson();
                if (currentPerson) {
                    const grabbedObjects = this.getGrabbedObjects();
                    const nearbyObjectsNotGrabbed = this.state.nearbyObjects.filter(nearbyObject => {
                        return !grabbedObjects.some(grabbedObject => grabbedObject.id === nearbyObject.id);
                    });

                    // toggle grab state on the union of grabbed and nearby objects
                    [...grabbedObjects, ...nearbyObjectsNotGrabbed].forEach(networkObject => {
                        this.handleSelectedObjectPropertyChange(networkObject, (object: INetworkObject): INetworkObject => {
                            // hide grabbing tutorial after successful grab of an object
                            if (this.state.tutorials.grabbing) {
                                this.setState({
                                    tutorials: {
                                        ...this.state.tutorials,
                                        grabbing: false
                                    }
                                });
                            }

                            return {
                                ...object,
                                grabbedByPersonId: object.grabbedByPersonId === currentPerson.id ? null : currentPerson.id
                            };
                        });
                    });
                }
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

        // return the grass tile positions
        return tilePositions;
    };

    render() {
        // find the current person
        const currentPerson = this.getCurrentPerson();

        // the offset of the entire world
        const worldOffset: IObject = {
            x: 0,
            y: 0
        };

        // an svg filter to apply to the world
        let worldFilter = "";

        // blur the world if the inventory screen is open
        if (this.state.vendingInventory.length > 0) {
            worldFilter = "url(#blur)";
        }

        // if current person exist
        if (currentPerson) {
            // center world around current person, the view should be centered on the person
            worldOffset.x = currentPerson.x - (this.state.width / 2);
            worldOffset.y = currentPerson.y - (this.state.height / 2);
        } else {
            // no player, blur the world
            worldFilter = "url(#blur)";
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
                            this.generateRoomMasks()
                        }
                        {
                            this.generateCarMasks()
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
                        <filter id="blur">
                            <feGaussianBlur stdDeviation={5}/>
                        </filter>
                        <filter id="highlight-white">
                            {/* https://stackoverflow.com/questions/49693471/svg-border-outline-for-group-of-elements */}
                            <feMorphology operator="dilate" in="SourceAlpha"
                                          radius="0" result="e1" />
                            <feMorphology operator="dilate" in="SourceAlpha"
                                          radius="2" result="e2" />
                            <feComposite in="e1" in2="e3" operator="xor"
                                         result="outline"/>
                            <feFlood floodColor="white" floodOpacity={0.3} result="color"/>
                            <feComposite in="color" in2="outline" operator="in" result="white-outline"/>
                            <feMerge>
                                <feMergeNode in="white-outline"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                        <filter id="highlight-blue">
                            {/* https://stackoverflow.com/questions/49693471/svg-border-outline-for-group-of-elements */}
                            <feMorphology operator="dilate" in="SourceAlpha"
                                          radius="0" result="e1" />
                            <feMorphology operator="dilate" in="SourceAlpha"
                                          radius="2" result="e2" />
                            <feComposite in="e1" in2="e3" operator="xor"
                                         result="outline"/>
                            <feFlood floodColor="blue" floodOpacity={0.3} result="color"/>
                            <feComposite in="color" in2="outline" operator="in" result="white-outline"/>
                            <feMerge>
                                <feMergeNode in="white-outline"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    <g transform={`translate(${-worldOffset.x},${-worldOffset.y})`} filter={worldFilter}>
                        {
                            // draw the grass on the bottom of the world
                            this.generateGrassTile(worldOffset).map(({x, y}: IObject) => {
                                return <rect key={`grass-tile-${x}-${y}`} x={x} y={y} width="500" height="300" fill="url(#grass)"/>;
                            })
                        }
                        {
                            // draw roads
                            this.drawRoads(worldOffset)
                        }
                        {
                            // draw persons, cars, and movable objects
                            this.sortDrawables(worldOffset).filter(this.isNearWorldView(worldOffset)).filter(this.isNearWorldView(worldOffset)).map(drawable => {
                                return drawable.draw();
                            })
                        }
                    </g>
                    <text x="20" y="20">Position: {worldOffset.x} {worldOffset.y}</text>
                    {
                        this.showWalkingTutorial() ? (
                            <g>
                                <text x="20" y="40" fill="black" fontSize={18}>Press the WASD keys to walk.</text>
                                <text x="125" y="130" fill={this.state.tutorials.walking.w ? "blue" : "black"} fontSize={36} textAnchor="middle">W</text>
                                <text x="45" y="210" fill={this.state.tutorials.walking.a ? "blue" : "black"} fontSize={36} textAnchor="middle">A</text>
                                <text x="125" y="210" fill={this.state.tutorials.walking.s ? "blue" : "black"} fontSize={36} textAnchor="middle">S</text>
                                <text x="205" y="210" fill={this.state.tutorials.walking.d ? "blue" : "black"} fontSize={36} textAnchor="middle">D</text>
                                <rect x="100" y="100" width="50" height="50" fill="white" opacity={0.5}/>
                                <rect x="20" y="180" width="50" height="50" fill="white" opacity={0.5}/>
                                <rect x="100" y="180" width="50" height="50" fill="white" opacity={0.5}/>
                                <rect x="180" y="180" width="50" height="50" fill="white" opacity={0.5}/>
                            </g>
                        ) : null
                    }
                    {
                        this.showDrivingTutorial() ? (
                            <g>
                                <text x="20" y="40" fill="black" fontSize={18}>Press the E key to Enter and Exit the car.</text>
                                <text x="125" y="210" fill="black" fontSize={36} textAnchor="middle">E</text>
                                <rect x="100" y="180" width="50" height="50" fill="white" opacity={0.5}/>
                            </g>
                        ) : null
                    }
                    {
                        this.showGrabbingTutorial() ? (
                            <g>
                                <text x="20" y="40" fill="black" fontSize={18}>Press G to Grab an object.</text>
                                <text x="125" y="210" fill="black" fontSize={36} textAnchor="middle">G</text>
                                <rect x="100" y="180" width="50" height="50" fill="white" opacity={0.5}/>
                            </g>
                        ) : null
                    }
                    {
                        this.showDrivingText() ? (
                            <g>
                                <text x="20" y={this.state.height - 60} fill="black" fontSize={18}>Starter</text>
                            </g>
                        ) : null
                    }
                    {
                        currentPerson && typeof currentPerson.cash === "number" ? (
                            <g>
                                <text x="20" y={this.state.height - 40} fill="black" fontSize={18}>Cash: {currentPerson.cash}</text>
                            </g>
                        ) : null
                    }
                    {
                        currentPerson && typeof currentPerson.creditLimit === "number" ? (
                            <g>
                                <text x="20" y={this.state.height - 20} fill="black" fontSize={18}>Credit: {currentPerson?.creditLimit}</text>
                            </g>
                        ) : null
                    }
                    {
                        currentPerson && this.state.vendingInventory.length > 0 ? (
                            <g>
                                <rect x="0" y="0" width={this.state.width} height={this.state.height} fill="white" opacity="0.3"/>
                                {
                                    this.state.vendingInventory.map((inventoryItem, index) => {
                                        return <text key={`inventory-item-${index}`} x="20" y={100 + index * 40} fontSize="24" onClick={() => {
                                            this.vendInventoryItem(inventoryItem);
                                        }}>{inventoryItem.objectType} ${inventoryItem.price}</text>;
                                    })
                                }
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
                {
                    this.state.nearestPersons.map(personId => {
                        const peerData = this.audioChatPeerData[personId];
                        if (peerData) {
                            return <audio key={personId} ref={peerData.ref} autoPlay/>;
                        } else {
                            return null;
                        }
                    })
                }
            </div>
        );
    }
}
