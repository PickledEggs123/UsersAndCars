import React from 'react';
import './App.scss';
import axios from "axios";
import {
    EAltitudeType,
    EBiomeType,
    ECarDirection,
    EDrawableType,
    ENetworkObjectType,
    ENpcJobType,
    IApiLotsBuyPost,
    IApiLotsSellPost,
    IApiPersonsGetResponse,
    IApiPersonsNpcJobPost,
    IApiPersonsPut,
    IApiPersonsVendPost,
    IApiPersonsVoiceAnswerMessage,
    IApiPersonsVoiceAnswerPost,
    IApiPersonsVoiceCandidateMessage,
    IApiPersonsVoiceCandidatePost,
    IApiPersonsVoiceOfferMessage,
    IApiPersonsVoiceOfferPost,
    IArea,
    ICar, ICellLock,
    ICraftingRecipe,
    IDrawable,
    IFloor,
    IGameTutorials,
    IHouse,
    IKeyDownHandler,
    ILot,
    INetworkObject,
    INetworkObjectBase, INetworkObjectCellPosition,
    INpc,
    INpcJob,
    INpcJobCrafting,
    INpcPathPoint,
    IObject,
    IPerson,
    IPersonsInventory,
    IResource,
    IRoad,
    IStockpile,
    IStockpileTile, ITerrainTilePosition,
    IVendorInventoryItem,
    IWall
} from "persons-game-common/lib/types/GameTypes";
import {PersonsLogin} from "./PersonsLogin";
import {IPersonsDrawablesProps, IPersonsDrawablesState, PersonsDrawables} from "./PersonsDrawables";
import {applyAudioFilters, PUBLIC_API_URL, rtcPeerConnectionConfiguration, userMediaConfig} from "./config";
import {HarvestResourceController} from "persons-game-common/lib/resources";
import {getMaxStackSize, InventoryController, listOfRecipes} from "persons-game-common/lib/inventory";
import {ConstructionController} from "persons-game-common/lib/construction";
import {getCurrentTDayNightTime, TDayNightTimeHour} from "persons-game-common/lib/types/time";
import {StockpileController} from "persons-game-common/lib/stockpile";
import {applyInventoryState, applyPathToNpc} from "persons-game-common/lib/npc";
import * as delaunay from "d3-delaunay";
import {
    areaTileSize,
    areaTileToId,
    generateTerrainAreas,
    getAreaTilePosition,
    terrainTileSize
} from "persons-game-common/lib/terrain";
import {
    getNetworkObjectCellString,
    networkObjectCellPositionToCellString
} from "persons-game-common/lib/cell";

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
    /**
     * The lot price for buying or selling a lot.
     */
    lotPrice: number | null;
    /**
     * The inventory for the current person.
     */
    inventory: IPersonsInventory | null;
    /**
     * If the inventory screen should be shown.
     */
    showInventory: boolean;
    /**
     * The error message of the last global error.
     */
    errorMessage: string;
    /**
     * The time of the error message of the last global error.
     */
    errorTime: Date;
    /**
     * If stockpile editing should be enabled.
     */
    showStockpile: boolean;
    /**
     * If the NPCs screen should be shown.
     */
    showNpcs: boolean;
    /**
     * If the map screen should be drawn.
     */
    showMap: boolean;
    /**
     * A list of areas around the current person.
     */
    areas: IArea[];
    /**
     * The previous tile position. Compared with the current tile position, if different, then regenerate areas.
     */
    lastAreaId: string | null;
    /**
     * The delaunay diagram of areas. Allow for quick search of current area.
     */
    areaDiagram: delaunay.Delaunay<any> | null;
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
     * The interval containing the terrain loop.
     */
    intervalTerrainLoop: any = null;

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
     * The interval for the follow npc script.
     */
    intervalFollow: any = null;

    /**
     * The distance to stop pressing the key when following an npc.
     */
    followDistance: number = 100;

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
     * The terrain refresh rate. 1000 means 1 second. Decreasing the value will update the terrain more often, but terrain
     * updates can be costly.
     */
    terrainRefreshSpeed: number = 6000;

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
     * The instance of handle key down. The normal window handler instance.
     */
    handleKeyDownInstance: any = null;

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
        npcs: [] as INpc[],
        houses: [] as IHouse[],
        walls: [] as IWall[],
        floors: [] as IFloor[],
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
        currentPersonId: null as string | null,
        currentNpcId: null as string | null,
        loadedCells: [] as INetworkObjectCellPosition[],
        loadedTerrainTiles: [] as ITerrainTilePosition[],
        cellLocks: [] as ICellLock[],
        lastUpdate: new Date().toISOString(),
        fetchTime: new Date(),
        vendingInventory: [] as IVendorInventoryItem[],
        nearestPersons: [] as string[],
        connectedVoiceChats: [] as string[],
        npc: null as INpc | null,
        lot: null as ILot | null,
        lotPrice: null as number | null,
        resources: [] as IResource[],
        stockpiles: [] as IStockpile[],
        stockpileTiles: [] as IStockpileTile[],
        inventory: null as IPersonsInventory | null,
        showInventory: false,
        showConstruction: false,
        showStockpile: false,
        showNpcs: false,
        showMap: false,
        errorMessage: "",
        errorTime: new Date(),
        areas: [] as IArea[],
        lastAreaId: null as string | null,
        areaDiagram: null as delaunay.Delaunay<any> | null
    };

    /**
     * A function which catches all errors in the window.
     * @param event The error event.
     */
    globalErrorHandler = (event: ErrorEvent) => {
        let errorMessage = "An error occurred";
        if (event.message) {
            errorMessage = event.message;
        }
        const errorTime = new Date();
        this.setState({
            errorMessage,
            errorTime
        });
        setTimeout(() => {
            this.setState({
                errorMessage: ""
            });
        }, 10000);
    };

    /**
     * Setup the game.
     */
    componentDidMount(): void {
        this.beginGameLoop();
        window.addEventListener("error", this.globalErrorHandler);
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
                    if (this.state.currentPersonId && personId < this.state.currentPersonId) {
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
        window.removeEventListener("error", this.globalErrorHandler);
    }

    /**
     * Cancel an active follow command.
     */
    cancelFollowCommand = () => {
        if (this.intervalFollow) {
            clearInterval(this.intervalFollow);
            this.intervalFollow = null;
        }
    };

    /**
     * The follow command used to follow objects.
     * @param npcCopy A copy of the NPC data. Contains information used to follow the object over time.
     */
    private followCommand = (npcCopy: INpc) => {
        let lastDx: number | undefined;
        let lastDy: number | undefined;
        return () => {
            const currentPerson = this.getCurrentPerson();
            const foundNpc = this.state.npcs.find(n => n.id === npcCopy.id);
            const npc = foundNpc ? applyPathToNpc(foundNpc) : undefined;

            /**
             * Simulate keyboard events to trigger the following of an object.
             * @param delta The current difference of position.
             * @param lastDelta The last difference of position.
             * @param threshold The threshold value to press or release the key.
             * @param key The key to press or release.
             */
            const pressAndReleaseKey = (delta: number, lastDelta: number | undefined, threshold: number, key: string) => {
                if (threshold > 0) {
                    // greater than threshold
                    if (delta >= threshold && (typeof lastDelta === "number" ? lastDelta < threshold : true)) {
                        // press key
                        this.handleKeyDown(true)(new KeyboardEvent("keydown", {
                            key
                        }));
                    }
                    // less than threshold
                    if (delta < threshold && (typeof lastDelta === "number" ? lastDelta >= threshold : true)) {
                        // release key
                        this.handleKeyUp(new KeyboardEvent("keyup", {
                            key
                        }));
                    }
                } else {
                    // greater than threshold
                    if (delta <= threshold && (typeof lastDelta === "number" ? lastDelta > threshold : true)) {
                        // press key
                        this.handleKeyDown(true)(new KeyboardEvent("keydown", {
                            key
                        }));
                    }
                    // less than threshold
                    if (delta > threshold && (typeof lastDelta === "number" ? lastDelta <= threshold : true)) {
                        // release key
                        this.handleKeyUp(new KeyboardEvent("keyup", {
                            key
                        }));
                    }
                }
            };

            if (currentPerson && npc) {
                // found current person and npc, follow npc
                const dx = npc.x - currentPerson.x;
                const dy = npc.y - currentPerson.y;

                // simulate key press if the object is out of range
                pressAndReleaseKey(dy, lastDy, -this.followDistance, "w");
                pressAndReleaseKey(dx, lastDx, -this.followDistance, "a");
                pressAndReleaseKey(dy, lastDy, this.followDistance, "s");
                pressAndReleaseKey(dx, lastDx, this.followDistance, "d");

                // copy values for next call
                lastDx = dx;
                lastDy = dy;
            } else {
                // cannot find current person or npc, end follow command
                clearInterval(this.intervalFollow);
                this.intervalFollow = null;

                // release all keys
                pressAndReleaseKey(0, -2, -1, "w");
                pressAndReleaseKey(0, -2, -1, "a");
                pressAndReleaseKey(0, 2, 1, "s");
                pressAndReleaseKey(0, 2, 1, "d");
            }
        };
    };

    /**
     * Follow an npc by pressing or releasing keyboard keys.
     * @param npcCopy The npc to follow.
     */
    followNpc = (npcCopy: INpc) => () => {
        // clear previous follow command
        this.cancelFollowCommand();

        // begin following npc
        this.intervalFollow = setInterval(this.followCommand(npcCopy), 20);
    };

    /**
     * Add all connection handlers for a peer connection.
     * @param peerConnection The peer connection to modify.
     * @param personId The person id the peer connection is for.
     * @param peerData The peer data containing the peer connection.
     */
    addPeerConnectionHandlers = (peerConnection: RTCPeerConnection, personId: string, peerData: IAudioChatPeerData) => {
        peerConnection.onicecandidate = (event) => {
            const {candidate} = event;
            if (!this.state.currentPersonId) {
                return;
            }
            const data: IApiPersonsVoiceCandidatePost = {
                from: this.state.currentPersonId,
                to: personId,
                candidate
            };
            axios.post(`${PUBLIC_API_URL}persons/voice/candidate`, data).catch((err) => {
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
                if (!this.state.currentPersonId) {
                    return;
                }
                const data: IApiPersonsVoiceOfferPost = {
                    from: this.state.currentPersonId,
                    to: personId,
                    description: peerConnection.localDescription
                };
                await axios.post(`${PUBLIC_API_URL}persons/voice/offer`, data);
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
            if (!this.state.currentPersonId) {
                return;
            }
            const data: IApiPersonsVoiceAnswerPost = {
                from: this.state.currentPersonId,
                to: from,
                description: peerConnection.localDescription
            };
            await axios.post(`${PUBLIC_API_URL}persons/voice/answer`, data);
        })().catch((err) => {
            console.log(err);
        });
    };

    /**
     * Handle the WebRTC voice chat candidate message.
     * @param message The candidate message.
     */
    handleVoiceAnswerMessage = (message: IApiPersonsVoiceAnswerMessage) => {
        if (!this.state.currentPersonId) {
            return;
        }
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
            axios.post(`${PUBLIC_API_URL}persons/vend`, data).then(() => {
                this.setState({vendingInventory: []});
            }).catch((err) => console.log(err));
        }
    };

    /**
     * Begin the login process.
     */
    beginLogin = () => {
        if (this.loginRef.current) {
            this.loginRef.current.toggleOpen();
        }
    };

    /**
     * The login component has successfully logged in. Load the username of the login to control the person.
     * @param username The id of the logged in person.
     */
    handleLoginSuccess = (username: string) => {
        this.setState({
            currentPersonId: username,
            currentNpcId: null
        });
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
        await axios.put(`${PUBLIC_API_URL}persons/data`, data);
        // wait for [[state.lastUpdate]] to update after the network call.
        await new Promise((resolve) => {
            this.setState({
                lastUpdate: new Date().toISOString()
            }, () => {
                resolve();
            });
        });
    };

    terrainLoop = async () => {
        const currentPerson = this.getCurrentPerson() || {x: 0, y: 0};
        if (currentPerson) {
            const currentAreaId = areaTileToId(getAreaTilePosition(currentPerson));
            if (!this.state.lastAreaId || (this.state.lastAreaId && this.state.lastAreaId !== currentAreaId)) {
                const areas = generateTerrainAreas(currentPerson);
                const areaDiagram = delaunay.Delaunay.from(areas.map(({x, y}) => [x, y]));
                this.setState({
                    areas,
                    areaDiagram,
                    lastAreaId: currentAreaId
                });
            }
        }

        // repeat
        this.intervalTerrainLoop = setTimeout(() => {
            this.terrainLoop();
        }, this.terrainRefreshSpeed);
    };

    /**
     * Begin the game loop.
     */
    beginGameLoop = () => {
        // add keyboard events
        this.handleKeyDownInstance = this.handleKeyDown(false);
        window.addEventListener("keydown", this.handleKeyDownInstance);
        window.addEventListener("keyup", this.handleKeyUp);

        // begin game loop
        this.intervalGameLoop = setTimeout(this.gameLoop, 0);
        this.intervalTerrainLoop = setTimeout(this.terrainLoop, 0);
        this.intervalHeartbeat = setInterval(this.heartbeat, this.heartbeatRefreshSpeed);

        // begin animation loop
        this.intervalAnimationLoop = requestAnimationFrame(this.animationLoop);
    };

    /**
     * Animate the React scene.
     */
    animationLoop = () => {
        // animation begun, clear animation loop interval, cannot cancel the loop now
        this.intervalAnimationLoop = null;

        let cars = this.state.cars;
        // check to see if the person is in a car
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            // there is an active car, edit path for smoke trail animation
            const currentCar = this.state.cars.find(car => currentPerson.carId && car.id === currentPerson.carId);
            if (currentCar) {
                // update current car path
                cars = cars.reduce((arr: ICar[], car: ICar): ICar[] => {
                    if (car.id === currentCar.id) {
                        // found matching car, update path
                        const newPathPoint: INpcPathPoint = {
                            time: new Date().toISOString(),
                            location: {
                                x: currentCar.x,
                                y: currentCar.y
                            }
                        };
                        const path: INpcPathPoint[] = car.path ?
                            [newPathPoint, ...car.path.filter(pathPoint => Date.parse(pathPoint.time) >= +new Date() - 10000)] :
                            [newPathPoint];
                        return [
                            ...arr,
                            {
                                ...car,
                                path
                            }
                        ];
                    } else {
                        // do nothing
                        return [...arr, car];
                    }
                }, []);
            }
        }

        // force react to update, creating the animation. The objects will move across the screen due to network interpolation.
        this.setState({cars}, () => {
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
        window.removeEventListener("keydown", this.handleKeyDownInstance);
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

        // stop terrain loop
        if (this.intervalTerrainLoop) {
            clearTimeout(this.intervalTerrainLoop);
            this.intervalTerrainLoop = null;
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
    updateMergeLocalAndNetworkData = <T extends INetworkObjectBase>(localArr: T[], networkArr: T[], networkItem: T): T[] => {
        // find local data
        const localItem = localArr.find(d => d.id === networkItem.id);

        // check to see if the local data is more up to date.
        if (localItem && +Date.parse(localItem.lastUpdate) > +Date.parse(networkItem.lastUpdate)) {
            // local data is more up to date, replace server position with local position, to prevent backward moving glitch
            const {x, y} = localItem;
            const path = (localItem as unknown as ICar).path;
            return [
                ...networkArr,
                {
                    ...networkItem,
                    x,
                    y,
                    path
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
        if (this.state.currentPersonId) {
            getRequestUrlSearchParams.append("id", this.state.currentPersonId);
        }
        const response = await axios.get<IApiPersonsGetResponse>(`https://us-central1-tyler-truong-demos.cloudfunctions.net/persons/data?${getRequestUrlSearchParams}`);
        if (response && response.data) {
            // get persons data from the server
            const {
                persons: serverPersons,
                npcs,
                cars: serverCars,
                objects: serverObjects,
                resources: serverResources,
                stockpiles: serverStockpiles,
                stockpileTiles: serverStockpileTiles,
                houses: serverHouses,
                floors: serverFloors,
                walls: serverWalls,
                voiceMessages: {
                    candidates,
                    offers,
                    answers
                },
                roads,
                lots,
                currentPersonId,
                currentNpcId,
                loadedCells,
                loadedTerrainTiles,
                cellLocks
            } = response.data;

            // handle voice metadata messages
            candidates.forEach(this.handleVoiceCandidateMessage);
            offers.forEach(this.handleVoiceOfferMessage);
            answers.forEach(this.handleVoiceAnswerMessage);

            // record the current fetch time of the data. Used for interpolating the drawings of networked objects.
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
            const resources = serverResources.reduce((arr: IResource[], networkObject: IResource): IResource[] => {
                return this.updateMergeLocalAndNetworkData(this.state.resources, arr, networkObject);
            }, []);
            const stockpiles = serverStockpiles.reduce((arr: IStockpile[], networkObject: IStockpile): IStockpile[] => {
                return this.updateMergeLocalAndNetworkData(this.state.stockpiles, arr, networkObject);
            }, []);
            const stockpileTiles = serverStockpileTiles.reduce((arr: IStockpileTile[], networkObject: IStockpileTile): IStockpileTile[] => {
                return this.updateMergeLocalAndNetworkData(this.state.stockpileTiles, arr, networkObject);
            }, []);
            const houses = serverHouses.reduce((arr: IHouse[], networkObject: IHouse): IHouse[] => {
                return this.updateMergeLocalAndNetworkData(this.state.houses, arr, networkObject);
            }, []);
            const floors = serverFloors.reduce((arr: IFloor[], networkObject: IFloor): IFloor[] => {
                return this.updateMergeLocalAndNetworkData(this.state.floors, arr, networkObject);
            }, []);
            const walls = serverWalls.reduce((arr: IWall[], networkObject: IWall): IWall[] => {
                return this.updateMergeLocalAndNetworkData(this.state.walls, arr, networkObject);
            }, []);
            const newCurrentPerson = persons.find(person => person.id === this.state.currentPersonId);
            const nearbyObjects = this.getNearbyObjects(newCurrentPerson, objects);
            const nearestPersons = this.getCurrentPerson() ?
                persons.filter(person => person.id !== this.state.currentPersonId).slice(0, 10).map(person => person.id) :
                [];
            const npc = npcs.find(n => this.state.npc && n.id === this.state.npc.id) || null;
            const lot = lots.find(l => this.state.lot && l.id === this.state.lot.id) || null;
            const inventory = newCurrentPerson ? newCurrentPerson.inventory : null;

            this.setState({
                persons,
                npcs,
                cars,
                objects,
                houses,
                floors,
                walls,
                nearbyObjects,
                lastUpdate: new Date().toISOString(),
                fetchTime,
                previousNetworkObjects: {
                    persons: this.state.persons,
                    cars: this.state.cars,
                    objects: this.state.objects,
                    fetchTime: this.state.fetchTime
                },
                nearestPersons,
                roads,
                lots,
                npc,
                lot,
                resources,
                inventory,
                stockpiles,
                stockpileTiles,
                currentPersonId,
                currentNpcId,
                loadedCells,
                loadedTerrainTiles,
                cellLocks
            });
        }

        // schedule next game loop
        this.intervalGameLoop = setTimeout(this.gameLoop, this.gameRefreshSpeed);
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
     * @param auto If the handler was triggered by an automatic function. Do not close certain windows and functions.
     */
    handleKeyDownMovementPerson = (event: KeyboardEvent, person: IPerson, auto: boolean) => (
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

                stateUpdates.push({
                    // close vending inventory list
                    vendingInventory: [],
                    // close npc viewer
                    npc: null,
                    // close lot viewer
                    lot: null,
                    // close person inventory
                    showInventory: false,
                });

                // merge optional state updates into one state update object to perform a single setState.
                const stateUpdate: IPersonsState = Object.assign.apply({}, [{}, ...stateUpdates]);
                this.setState(stateUpdate);

                // cancel follow command
                if (!auto) {
                    this.cancelFollowCommand();
                }
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
     * @param auto If the handler was triggered by an automatic function. Do not close certain windows and functions.
     */
    handleKeyDown = (auto: boolean) => (event: KeyboardEvent) => {
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
                this.handleKeyDownMovementPerson(event, currentPerson, auto)((person: IObject, car?: ICar): IObject => {
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
                this.handleKeyDownMovementPerson(event, currentPerson, auto)((person: IObject, car?: ICar): IObject => {
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
                this.handleKeyDownMovementPerson(event, currentPerson, auto)((person: IObject, car?: ICar): IObject => {
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
                this.handleKeyDownMovementPerson(event, currentPerson, auto)((person: IObject, car?: ICar): IObject => {
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
     * Generate a list of world space tiles to draw. The tiles should always be around the world view. Should reduce the
     * amount of tiles drown in the world. The tiles can represent different things like terrain or cell positions.
     * @param worldOffset The offset of the camera.
     * @param tileWidth The width of a tile.
     * @param tileHeight The height of a tile.
     */
    generateWorldTiles = (worldOffset: IObject, {tileWidth, tileHeight}: {tileWidth: number, tileHeight: number}): IObject[] => {
        // calculate current tile position
        const tilePosition: IObject = {
            x: Math.floor(worldOffset.x / tileWidth),
            y: Math.floor(worldOffset.y / tileHeight)
        };

        // calculate a list of tiles around the world view, it should cover the world view
        const tilePositions = [] as IObject[];
        // for the x axis, go from most left to most right tile
        const widthRange = Math.ceil(this.state.width / tileWidth);
        const heightRange = Math.ceil(this.state.height / tileHeight);
        for (let i = -1; i <= widthRange; i++) {
            // for the y axis, go from most top to most bottom tile
            for (let j = -1; j <= heightRange; j++) {
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

    /**
     * Refresh all NPCs on the server.
     */
    refreshNpcs = async () => {
        await axios.post(`${PUBLIC_API_URL}npcs/refresh`);
        alert("NPCs have been reset");
    };

    /**
     * Handle lot price changes.
     */
    handleLotPrice = (event: React.KeyboardEvent) => {
        const key = event.key;
        const previousLotPrice: string = typeof this.state.lotPrice === "number" ? this.state.lotPrice.toString() : "";
        if (/[0-9]/.test(key)) {
            this.setState({
                lotPrice: Number(`${previousLotPrice}${key}`)
            });
        } else if (key === "Backspace") {
            this.setState({
                lotPrice: Number(previousLotPrice.substr(0, previousLotPrice.length - 1))
            });
        }
    };

    /**
     * Create a buy offer for a lot.
     */
    buyLot = (lot: ILot) => async () => {
        if (!this.state.currentPersonId) {
            return;
        }
        if (typeof this.state.lotPrice === "number") {
            const data: IApiLotsBuyPost = {
                lotId: lot.id,
                price: this.state.lotPrice,
                personId: this.state.currentPersonId
            };
            await axios.post(`${PUBLIC_API_URL}lots/buy`, data);
        }
    };

    /**
     * Create a sell offer for a lot.
     */
    sellLot = (lot: ILot) => async () => {
        if (!this.state.currentPersonId) {
            return;
        }
        if (typeof this.state.lotPrice === "number") {
            const data: IApiLotsSellPost = {
                lotId: lot.id,
                price: this.state.lotPrice,
                personId: this.state.currentPersonId
            };
            await axios.post(`${PUBLIC_API_URL}lots/sell`, data);
        }
    };

    /**
     * Accept buy offer.
     */
    acceptBuyOffer = (offer: IApiLotsBuyPost) => async () => {
        await axios.post(`${PUBLIC_API_URL}lots/buy/accept`, offer)
    };

    /**
     * Accept sell offer.
     */
    acceptSellOffer = (offer: IApiLotsSellPost) => async () => {
        await axios.post(`${PUBLIC_API_URL}lots/sell/accept`, offer)
    };

    /**
     * Update a resource in the resource list.
     * @param resourceId The id of the resource to update.
     * @param update The update function to apply to the matching resource.
     */
    updateResource = (resourceId: string, update: (resource: IResource) => IResource): IResource[] => {
        return this.state.resources.reduce((arr: IResource[], resource: IResource): IResource[] => {
            if (resource.id === resourceId) {
                // found the tree, deplete it
                return [
                    ...arr,
                    {
                        ...update(resource),
                        lastUpdate: new Date().toISOString()
                    }
                ];
            } else {
                // did not find the tree, no change
                return [...arr, resource];
            }
        }, []);
    };

    /**
     * Deplete the resource.
     * @param resourceId The id of the resource to deplete.
     * @param respawnTime The amount of time for the resource to respawn.
     */
    depleteResource = (resourceId: string, respawnTime: number): IResource[] => {
        return this.updateResource(resourceId, (resource: IResource): IResource => ({
            ...resource,
            depleted: true,
            readyTime: new Date(+new Date() + respawnTime).toISOString()
        }));
    };

    /**
     * Harvest a resource on the map.
     */
    harvestResource = async (resource: IResource) => {
        const controller = new HarvestResourceController(resource);
        const {
            spawn,
            respawnTime
        } = controller.spawn();
        const postData = controller.getPostData();

        await axios.post(`${PUBLIC_API_URL}persons/resource/harvest`, postData);

        if (spawn) {
            // update objects array
            const objects = [...this.state.objects.filter(o => o.id !== spawn.id), spawn];

            // deplete the tree
            const resources = this.depleteResource(resource.id, respawnTime);

            // update state
            this.setState({
                objects,
                resources
            });
        }
    };

    pickUpObject = async (networkObject: INetworkObject) => {
        // get current person
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            const controller = new InventoryController(currentPerson);
            const {
                updatedItem,
                stackableSlots
            } = controller.pickUpItem(networkObject);
            const inventory = controller.getInventory();

            // make http request to pick up item
            const pickUpRequest = controller.pickUpItemRequest(currentPerson, networkObject);
            // begin picking up
            await axios.post(`${PUBLIC_API_URL}persons/object/pickup`, pickUpRequest);

            // update objects array
            const objects = this.state.objects.reduce((acc: INetworkObject[], obj: INetworkObject): INetworkObject[] => {
                if (obj.id === networkObject.id) {
                    // found object
                    if (updatedItem === null) {
                        // updated item was deleted, do not include in new array
                        return acc;
                    } else {
                        // updated item was updated, replace old object with new updated item
                        return [
                            ...acc,
                            updatedItem
                        ];
                    }
                } else if (stackableSlots.map(s => s.id).includes(obj.id)) {
                    // the item was placed into a stackable slot, update stackable slot
                    const stackableSlot = stackableSlots.find(s => s.id === obj.id) as INetworkObject;
                    return [
                        ...acc,
                        stackableSlot
                    ];
                } else {
                    // not object, keep same item
                    return [
                        ...acc,
                        obj
                    ];
                }
            }, []);
            const persons = this.state.persons.map(person => {
                if (person.id === currentPerson.id) {
                    // found person, update inventory
                    return {
                        ...person,
                        inventory
                    };
                } else {
                    // not person, do nothing
                    return person;
                }
            });
            this.setState({
                objects,
                persons
            });
        }
    };

    withdrawFromStockpile = async (networkObject: INetworkObject, stockpile: IStockpile) => {
        // get current person
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            const stockpileController = new InventoryController(stockpile);
            const personController = new InventoryController(currentPerson);
            const amount = getMaxStackSize(networkObject.objectType);
            const {
                updatedItem: withdrawnItem
            } = stockpileController.withdrawFromStockpile(networkObject, amount);
            if (!withdrawnItem) {
                throw new Error("No item withdrawn from stockpile");
            }
            const {
                updatedItem,
                stackableSlots
            } = personController.pickUpItem(withdrawnItem);

            // make http request to pick up item
            const withdrawRequest = personController.withdrawItemFromStockpileRequest(currentPerson, networkObject, stockpile, amount);
            // begin picking up
            await axios.post(`${PUBLIC_API_URL}persons/stockpile/withdraw`, withdrawRequest);

            // update objects array
            const objects = this.state.objects.reduce((acc: INetworkObject[], obj: INetworkObject): INetworkObject[] => {
                if (obj.id === networkObject.id) {
                    // found object
                    if (updatedItem === null) {
                        // updated item was deleted, do not include in new array
                        return acc;
                    } else {
                        // updated item was updated, replace old object with new updated item
                        return [
                            ...acc,
                            updatedItem
                        ];
                    }
                } else if (stackableSlots.map(s => s.id).includes(obj.id)) {
                    // the item was placed into a stackable slot, update stackable slot
                    const stackableSlot = stackableSlots.find(s => s.id === obj.id) as INetworkObject;
                    return [
                        ...acc,
                        stackableSlot
                    ];
                } else {
                    // not object, keep same item
                    return [
                        ...acc,
                        obj
                    ];
                }
            }, []);
            const persons = this.state.persons.map(person => {
                if (person.id === currentPerson.id) {
                    // found person, update inventory
                    return {
                        ...person,
                        inventory: personController.getInventory()
                    };
                } else {
                    // not person, do nothing
                    return person;
                }
            });
            const stockpiles = this.state.stockpiles.map(s => {
                if (s.id === stockpile.id) {
                    // found person, update inventory
                    return {
                        ...s,
                        inventory: stockpileController.getInventory()
                    };
                } else {
                    // not person, do nothing
                    return s;
                }
            });
            this.setState({
                objects,
                persons,
                stockpiles
            });
        }
    };

    dropObject = async (networkObject: INetworkObject) => {
        // get current person
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            const controller = new InventoryController(currentPerson);
            const {
                updatedItem
            } = controller.dropItem(networkObject);
            const inventory = controller.getInventory();

            // make http request to drop item
            const dropRequest = controller.dropItemRequest(currentPerson, networkObject);
            // begin picking up
            await axios.post(`${PUBLIC_API_URL}persons/object/drop`, dropRequest);

            // update the local copy to immediately show the item being dropped before the network update
            // this will occur before the official object drop
            // place the object onto the ground
            const objects = this.state.objects.map(o => {
                if (updatedItem && o.id === networkObject.id) {
                    // found object, update it
                    return updatedItem;
                } else {
                    // did not find object, do nothing
                    return o;
                }
            });
            const persons = this.state.persons.map(p => {
                if (p.id === this.state.currentPersonId) {
                    // found person, update inventory
                    return {
                        ...p,
                        inventory
                    }
                } else {
                    // did not find person, do nothing
                    return p;
                }
            });
            this.setState({
                objects,
                persons
            });
        }
    };

    private mergeInventoryTransactionIntoObjects = ({
        updatedItems,
        stackableSlots,
        deletedSlots,
        modifiedSlots
    }: {
        updatedItems: INetworkObject[],
        stackableSlots: INetworkObject[],
        deletedSlots: string[],
        modifiedSlots: INetworkObject[]
    }): INetworkObject[] => {
        const objects = this.state.objects.reduce((acc: INetworkObject[], obj: INetworkObject): INetworkObject[] => {
            if (updatedItems.map(u => u.id).includes(obj.id)) {
                // found duplicate item, do not add
                return acc;
            } else if (deletedSlots.includes(obj.id)) {
                // found item that was used in the recipe, do not add
                return acc;
            } else if (modifiedSlots.map(m => m.id).includes(obj.id)) {
                const modifiedSlot = modifiedSlots.find(m => m.id === obj.id) as INetworkObject;
                return [
                    ...acc,
                    modifiedSlot
                ];
            } else if (stackableSlots.map(s => s.id).includes(obj.id)) {
                const stackableSlot = stackableSlots.find(s => s.id === obj.id) as INetworkObject;
                return [
                    ...acc,
                    stackableSlot
                ];
            } else {
                // other item, keep the item
                return [
                    ...acc,
                    obj
                ];
            }
        }, []);
        objects.push(...updatedItems);
        return objects;
    };

    craftRecipe = async (recipe: ICraftingRecipe) => {
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            const controller = new InventoryController(currentPerson);
            const {
                updatedItem,
                stackableSlots,
                deletedSlots,
                modifiedSlots
            } = controller.craftItem(recipe);

            const postData = controller.craftItemRequest(currentPerson, recipe);
            await axios.post(`${PUBLIC_API_URL}persons/object/craft`, postData);

            const objects = this.mergeInventoryTransactionIntoObjects({
                updatedItems: updatedItem ? [updatedItem] : [],
                stackableSlots,
                deletedSlots,
                modifiedSlots
            });
            const persons = this.state.persons.map(person => {
                if (person.id === currentPerson.id) {
                    // found person, update inventory
                    return {
                        ...person,
                        ...controller.getState() as Partial<IPerson>
                    };
                } else {
                    // did not find person, do nothing
                    return person;
                }
            });
            this.setState({
                objects,
                persons
            });
        }
    };

    showInventory = () => {
        this.setState({showInventory: !this.state.showInventory});
    };

    showConstruction = () => {
        this.setState({showConstruction: !this.state.showConstruction});
    };

    showStockpile = () => {
        this.setState({showStockpile: !this.state.showStockpile});
    };

    showNpcs = () => {
        this.setState({showNpcs: !this.state.showNpcs});
    };

    showMap = () => {
        this.setState({showMap: !this.state.showMap});
    };

    /**
     * Construct a stockpile at a location.
     */
    constructStockpileAtLocation = async (location: IObject) => {
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            const controller = new StockpileController({
                person: currentPerson,
                stockpiles: this.state.stockpiles,
                stockpileTiles: this.state.stockpileTiles
            });
            const {
                stockpileTilesToRemove,
                stockpileTilesToAdd,
                stockpileTilesToModify,
                stockpilesToRemove,
                stockpilesToModify,
                stockpilesToAdd
            } = controller.constructStockpile({location});

            const postData = controller.getConstructionStockpileRequest(location);
            await axios.post(`${PUBLIC_API_URL}persons/construction/stockpile`, postData);

            // update local state with the changes
            const stockpiles: IStockpile[] = [
                ...this.state.stockpiles.filter(stockpile => {
                    return !stockpilesToRemove.some(s => s.id === stockpile.id)
                }).map(stockpile => {
                    const modifiedStockpile = stockpilesToModify.find(s => s.id === stockpile.id);
                    if (modifiedStockpile) {
                        return modifiedStockpile;
                    } else {
                        return stockpile;
                    }
                }),
                ...stockpilesToAdd
            ];
            const stockpileTiles: IStockpileTile[] = [
                ...this.state.stockpileTiles.filter(tile => {
                    return !stockpileTilesToRemove.some(t => t.id === tile.id)
                }).map(tile => {
                    const modifiedStockpileTile = stockpileTilesToModify.find(s => s.id === tile.id);
                    if (modifiedStockpileTile) {
                        return modifiedStockpileTile;
                    } else {
                        return tile;
                    }
                }),
                ...stockpileTilesToAdd
            ];

            this.setState({
                stockpiles,
                stockpileTiles
            });
        }
    };

    /**
     * Construct a building at a location.
     */
    constructAtLocation = async (location: IObject) => {
        const currentPerson = this.getCurrentPerson();
        if (currentPerson) {
            const controller = new ConstructionController({
                inventoryHolder: currentPerson,
                houses: this.state.houses,
                floors: this.state.floors,
                walls: this.state.walls
            });
            const {
                wallsToAdd,
                wallsToRemove,
                floorsToAdd,
                floorsToRemove,
                housesToAdd,
                housesToRemove,
                deletedSlots,
                modifiedSlots,
                updatedItems,
                stackableSlots
            } = controller.constructBuilding({location});

            const postData = controller.getConstructionRequest(location);
            await axios.post(`${PUBLIC_API_URL}persons/construction`, postData);

            // update local state with the changes
            const houses = [
                ...this.state.houses.filter(house => !housesToRemove.some(h => h.id === house.id)),
                ...housesToAdd
            ];
            const walls = [
                ...this.state.walls.filter(wall => !wallsToRemove.some(w => w.id === wall.id)),
                ...wallsToAdd
            ];
            const floors = [
                ...this.state.floors.filter(floor => !floorsToRemove.some(f => f.id === floor.id)),
                ...floorsToAdd
            ];

            const objects = this.mergeInventoryTransactionIntoObjects({
                updatedItems,
                stackableSlots,
                deletedSlots,
                modifiedSlots
            });
            const persons = this.state.persons.map(person => {
                if (person.id === currentPerson.id) {
                    // found person, update inventory
                    return {
                        ...person,
                        ...controller.getState().inventoryHolder as Partial<IPerson>
                    };
                } else {
                    // did not find person, do nothing
                    return person;
                }
            });
            this.setState({
                houses,
                walls,
                floors,
                objects,
                persons
            });
        }
    };

    drawInventory = (inventory: IPersonsInventory, showCraftingRecipes: boolean): JSX.Element => (
        <g>
            <rect x="0" y="0" width={this.state.width} height={this.state.height} fill="white" opacity="0.3"/>
            {
                new Array(inventory.rows).fill(0).map((v, rowIndex) => {
                    return new Array(inventory.columns).fill(0).map((v1, columnIndex) => {
                        const slotIndex = rowIndex * inventory.columns + columnIndex;
                        const inventoryObject = inventory.slots[slotIndex] ?
                            inventory.slots[slotIndex] :
                            null;
                        let inventoryRender: JSX.Element[] | null = null;
                        if (inventoryObject) {
                            inventoryRender = this.drawNetworkObject(inventoryObject, undefined, true)
                                .sort(this.sortDrawablesInUiOrder)
                                .map(drawable => drawable.draw());
                        }

                        return (
                            <g key={`inventory-slot(${rowIndex},${columnIndex})`}>
                                <rect x={50 + 80 * columnIndex} y={50 + 80 * rowIndex} width={60} height={60} fill="tan" opacity={0.3}/>
                                {
                                    inventoryRender ? (
                                        <g transform={`translate(${50 + 80 * columnIndex + 30},${50 + 80 * rowIndex + 60})`} onClick={inventoryObject ? () => this.dropObject(inventoryObject) : undefined}>
                                            {inventoryRender}
                                        </g>
                                    ) : null
                                }
                            </g>
                        );
                    });
                }).reduce((acc: JSX.Element[], row: JSX.Element[], index: number): JSX.Element[] => {
                    if (index === 0) {
                        return [
                            ...acc,
                            ...row
                        ];
                    } else {
                        const y = 50 * 80 * index + 10;
                        return [
                            ...acc,
                            <line key={`inventory-row-divider-${index}`} x1={50} x2={this.state.width - 50} y1={y} y2={y} stroke="black"/>,
                            ...row
                        ];
                    }
                }, [])
            }
            {
                showCraftingRecipes ? (
                    <>
                        <text x={50} y={330} fontSize={18}>Crafting Recipes</text>
                        {
                            listOfRecipes.filter(recipe => recipe.byHand).map((recipe, index) => {
                                const row = Math.floor(index / 10);
                                const column = index % 10;
                                const x = 50 + column * 80;
                                const y = 350 + row * 80;
                                return (
                                    <g key={recipe.product} transform={`translate(${x},${y})`}
                                       onClick={() => this.craftRecipe(recipe)}>
                                        <rect x={0} y={0} width={60} height={60} fill="tan" opacity={0.3}/>
                                        <g transform="translate(30,60)">
                                            {
                                                this.drawNetworkObject({
                                                    id: `recipe-${recipe.product}`,
                                                    x: 0,
                                                    y: 0,
                                                    objectType: recipe.product,
                                                    lastUpdate: new Date().toISOString(),
                                                    insideStockpile: null,
                                                    grabbedByNpcId: null,
                                                    grabbedByPersonId: null,
                                                    isInInventory: true,
                                                    health: {
                                                        rate: 0,
                                                        max: 1,
                                                        value: 1
                                                    },
                                                    amount: 1,
                                                    exist: true,
                                                    state: []
                                                }).sort(this.sortDrawablesInUiOrder)
                                                    .map(drawable => drawable.draw())
                                            }
                                        </g>
                                    </g>
                                );
                            })
                        }
                    </>
                ) : null
            }
        </g>
    );

    /**
     * Make a POST request to change the job of the NPC.
     */
    npcSetJob = async (npc: INpc, jobType: ENpcJobType) => {
        if (!this.state.currentPersonId) {
            return;
        }

        let job: INpcJob;
        if (jobType === ENpcJobType.GATHER) {
            job = {
                type: jobType
            };
        } else if (jobType === ENpcJobType.CRAFT) {
            job = {
                type: jobType,
                products: [ENetworkObjectType.WATTLE_WALL]
            } as INpcJobCrafting;
        } else if (jobType === ENpcJobType.HAUL) {
            job = {
                type: jobType
            };
        } else {
            throw new Error("Unknown NPC Job Type");
        }

        const postData: IApiPersonsNpcJobPost = {
            personId: this.state.currentPersonId,
            npcId: npc.id,
            job
        };
        await axios.post(`${PUBLIC_API_URL}persons/npc/job`, postData);
    };

    getAreaFill = (area: IArea | null): string => {
        if (area) {
            if (area.biomeType === EBiomeType.BEACH) {
                return "url(#sand)";
            } else if (area.altitudeType === EAltitudeType.OCEAN) {
                return "url(#water)";
            } else if (area.altitudeType === EAltitudeType.SWAMP) {
                return "url(#bog)";
            } else if (area.altitudeType === EAltitudeType.PLAIN) {
                return "url(#grass)";
            } else if (area.altitudeType === EAltitudeType.HILL) {
                return "url(#grass)";
            } else if (area.altitudeType === EAltitudeType.MOUNTAIN) {
                return "url(#gravel)";
            } else if (area.altitudeType === EAltitudeType.ROCKY) {
                return "url(#gravel)";
            }
        }
        return "url(#loading)";
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

        // blur the world if the inventory screen is open or if viewing an NPC
        if (this.state.vendingInventory.length > 0 || this.state.npc) {
            worldFilter = "url(#blur)";
        }

        // if current person exist
        if (currentPerson) {
            // center world around current person, the view should be centered on the person
            worldOffset.x = currentPerson.x - (this.state.width / 2);
            worldOffset.y = currentPerson.y - (this.state.height / 2);
        } else {
            // // no player, blur the world
            // worldFilter = "url(#blur)";
        }

        const timeOfDay = getCurrentTDayNightTime();
        const timeOfDayScalar = timeOfDay / TDayNightTimeHour / 24;
        const timeOfDayHour = Math.floor(timeOfDayScalar * 24 % 12).toString();
        const timeOfDayMinuteRaw: string = Math.floor(timeOfDayScalar * 24 * 60 % 60).toString();
        const timeOfDayMinute = timeOfDayMinuteRaw.length === 1 ? `0${timeOfDayMinuteRaw}` : timeOfDayMinuteRaw;
        const timeOfDayAmPm = timeOfDayScalar < 0.5 ? "am" : "pm";
        const day: boolean = timeOfDayScalar >= 0.25 && timeOfDayScalar < 0.75;
        const sunMoonScale = (timeOfDayScalar + 0.25) % 0.5;

        const npc = this.state.npc ? applyInventoryState(this.state.npc) : null;

        const mapPaddingWidth = this.state.width;
        const mapPaddingHeight = this.state.height;
        const mapPadding = Math.max(mapPaddingHeight, mapPaddingWidth);
        const mapScale = mapPadding / (areaTileSize * 2);

        return (
            <div className="persons">
                <h1>Multiplayer Room</h1>
                <p>Use the left and right arrow keys or WASD keys to move the player left and right within the room.</p>
                <PersonsLogin loginSuccess={this.handleLoginSuccess} ref={this.loginRef}/>
                <div>
                    <button onClick={this.beginLogin}>Login</button>
                    <button onClick={this.showInventory}>Inventory</button>
                    <button onClick={this.showConstruction}>Construction</button>
                    <button onClick={this.showStockpile}>Stockpile</button>
                    <button onClick={this.showNpcs}>NPCs</button>
                    <button onClick={this.showMap}>Map</button>
                </div>
                <div style={{backgroundColor: "red", color: "white"}}>
                    {this.state.errorMessage}
                </div>
                <svg className="game" width={this.state.width} height={this.state.height} style={{border: "1px solid black"}}>
                    <defs>
                        {
                            this.generateCarMasks()
                        }
                        <pattern id="loading" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                            <image href="/loading.gif" width="32" height="32"/>
                        </pattern>
                        <pattern id="grass" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                            <image href="/grass.png" width="16" height="16"/>
                        </pattern>
                        <pattern id="sand" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                            <image href="/sand.png" width="32" height="32"/>
                        </pattern>
                        <pattern id="water" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                            <image href="/water.png" width="32" height="32"/>
                        </pattern>
                        <pattern id="bog" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                            <image href="/bog.png" width="32" height="32"/>
                        </pattern>
                        <pattern id="gravel" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                            <image href="/gravel.png" width="32" height="32"/>
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
                        <pattern id="wattle" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                            <image href="/wattle.png" width="32" height="32"/>
                        </pattern>
                        <pattern id="dirt" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                            <image href="/dirt.png" width="32" height="32"/>
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
                            this.generateWorldTiles(worldOffset, {tileWidth: 1000, tileHeight: 1000}).reduce((acc: JSX.Element[], {x, y}: IObject) => {
                                const diagram = delaunay.Delaunay.from(this.state.areas.map(({x, y}) => [x, y])).voronoi([
                                    x,
                                    y,
                                    x + 1000,
                                    y + 1000
                                ]);
                                const polygons: JSX.Element[] = [];
                                for (let i = 0; i < this.state.areas.length; i++) {
                                    const cellPolygon = diagram.cellPolygon(i);
                                    if (!cellPolygon) {
                                        continue;
                                    }
                                    const area = this.state.areas[i];
                                    const worldCellLoaded = this.state.loadedCells.some(cellPosition => {
                                        return getNetworkObjectCellString({x, y}) === networkObjectCellPositionToCellString(cellPosition);
                                    });
                                    const terrainTileLoaded = this.state.loadedTerrainTiles.some(tilePosition => {
                                        return tilePosition.tileX === Math.floor(x / terrainTileSize) &&
                                            tilePosition.tileY === Math.floor(y / terrainTileSize);
                                    });
                                    const fill = worldCellLoaded && terrainTileLoaded ?
                                        this.getAreaFill(area) :
                                        "url(#loading)";
                                    const points = cellPolygon.map(([x, y]) => `${x},${y}`).join(" ");
                                    polygons.push(
                                        <polygon key={`terrain-tile-${x}-${y}-area-tile-${area.x}-${area.y}`} points={points} fill={fill} stroke={fill}/>
                                    );
                                }
                                return [
                                    ...acc,
                                    ...polygons
                                ];
                            }, [])
                        }
                        {
                            // draw transparent cells to highlight zones in the world, each zone will group npcs together, the player should know zone boundaries
                            this.state.showConstruction || this.state.showStockpile ? this.generateWorldTiles(worldOffset, {tileWidth: 2000, tileHeight: 2000}).map(({x, y}: IObject) => {
                                return (
                                    <g key={`cellZone(${x},${y})`} transform={`translate(${x},${y})`}>
                                        <rect x="0" y="0" width="2000" height="2000" stroke="green" fill="green" fillOpacity={0.3}/>
                                        <circle fill="green" cx="1000" cy="1000" r="10"/>
                                        <text x="1000" y="980" fontSize={14}>Cell ({x / 2000},{y / 2000})</text>
                                    </g>
                                );
                            }) : null
                        }
                        {
                            this.state.showConstruction ? this.generateWorldTiles(worldOffset, {tileWidth: 200, tileHeight: 200}).map(({x, y}: IObject) => {
                                return (
                                    <g key={`constructionTile(${x},${y})`} transform={`translate(${x},${y})`} onClick={() => this.constructAtLocation({x, y})}>
                                        <rect x="20" y="20" width={160} height={160} fill="lightgrey" fillOpacity={0.3}/>
                                        <text x="50" y="100" fontSize={14}>Click to build</text>
                                    </g>
                                )
                            }) : null
                        }
                        {
                            this.state.showStockpile ? this.generateWorldTiles(worldOffset, {tileWidth: 200, tileHeight: 200}).map(({x, y}: IObject) => {
                                const stockpileTile = this.state.stockpileTiles.find(tile => tile.x === x && tile.y === y);
                                return (
                                    <g key={`stockpileTile(${x},${y})`} transform={`translate(${x},${y})`} onClick={() => this.constructStockpileAtLocation({x, y})}>
                                        {
                                            stockpileTile ? (
                                                <rect x="0" y="0" width={200} height={200} fill="lightgrey" fillOpacity={0.6}/>
                                            ) : (
                                                <rect x="20" y="20" width={160} height={160} fill="lightgrey" fillOpacity={0.3}/>
                                            )
                                        }
                                        <text x="50" y="100" fontSize={14}>{stockpileTile ? `Click to Remove` : `Click to Build`}</text>
                                    </g>
                                );
                            }) : this.state.stockpileTiles.reduce((acc: Array<JSX.Element | null>, {x, y, stockpileId, stockpileIndex}: IStockpileTile): Array<JSX.Element | null> => {
                                const foundStockpile = this.state.stockpiles.find(s => s.id === stockpileId);
                                if (!foundStockpile) {
                                    return acc;
                                }

                                const cellLock: ICellLock | null = this.state.cellLocks.find(c => c.cell === getNetworkObjectCellString(foundStockpile)) || null;
                                const pauseDate: Date | null = cellLock ? new Date(Date.parse(cellLock.pauseDate)) : null;
                                const stockpile = applyInventoryState(foundStockpile, pauseDate);
                                const items = stockpile.inventory.slots.slice(
                                    stockpileIndex * StockpileController.NUMBER_OF_COLUMNS_PER_STOCKPILE_TILE * StockpileController.NUMBER_OF_ROWS_PER_STOCKPILE_TILE,
                                    (stockpileIndex + 1) * StockpileController.NUMBER_OF_COLUMNS_PER_STOCKPILE_TILE * StockpileController.NUMBER_OF_ROWS_PER_STOCKPILE_TILE
                                );

                                return [
                                    ...acc,
                                    (
                                        <g key={`stockpileTile(${x},${y})-background`} transform={`translate(${x},${y})`}>
                                            <rect x="0" y="0" width={200} height={200} fill="lightgrey" fillOpacity={0.3}/>
                                        </g>
                                    ),
                                    ...items.reduce((acc: Array<IDrawable & {item: INetworkObject, itemX: number, itemY: number}>, item, index) => {
                                        const numColumns = 5;
                                        const columnWidth = 40;
                                        const columnOffset = 20;
                                        const rowHeight = 100;
                                        const rowOffset = 50;
                                        const itemX = (index % numColumns) * columnWidth + columnOffset;
                                        const itemY = Math.floor(index / numColumns) * rowHeight + rowOffset;
                                        return [
                                            ...acc,
                                            ...this.drawNetworkObject(item, undefined, true, stockpile).map((drawable: IDrawable): IDrawable & { itemX: number, itemY: number, item: INetworkObject } => ({
                                                ...drawable,
                                                itemX,
                                                itemY,
                                                item
                                            }))
                                        ];
                                    }, []).sort(this.sortDrawablesInUiOrder)
                                        .map((drawable: any) => {
                                        return (
                                            <g key={`${drawable.item.id}-${drawable.type}`} z={drawable.type === EDrawableType.TAG ? 1 : 0} transform={`translate(${x + drawable.itemX},${y + drawable.itemY})`}>
                                                {
                                                    drawable.draw()
                                                }
                                            </g>
                                        );
                                    })
                                ];
                            }, [])
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
                    <g key="dayNight" style={{pointerEvents: "none"}}>
                        {
                            day ? (
                                <>
                                    <rect x={0} y={0} width={this.state.width} height={this.state.height} fill="blue" opacity={0.3 * Math.abs(sunMoonScale - 0.5)}/>
                                    <rect x={0} y={0} width={this.state.width} height={this.state.height} fill="goldenrod" opacity={0.3 * (1 - Math.abs(sunMoonScale - 0.5))}/>
                                </>
                            ) : (
                                <>
                                    <rect x={0} y={0} width={this.state.width} height={this.state.height} fill="goldenrod" opacity={0.3 * Math.abs(sunMoonScale - 0.5)}/>
                                    <rect x={0} y={0} width={this.state.width} height={this.state.height} fill="blue" opacity={0.3 * (1 - Math.abs(sunMoonScale - 0.5))}/>
                                </>
                            )
                        }
                    </g>
                    {
                        this.state.showMap ? (
                            <g transform={`translate(${this.state.width / 2},${this.state.height / 2})`}>
                                {
                                    this.state.areas.map(area => {
                                        const points = area.corners.map(({x, y}) => {
                                            return `${(x - worldOffset.x) * mapScale},${(y - worldOffset.y) * mapScale}`;
                                        }).join(" ");
                                        const fill = this.getAreaFill(area);
                                        return (
                                            <polygon key={`map-area-${area.x}-${area.y}`} points={points} fill={fill} stroke={fill}/>
                                        );
                                    })
                                }
                                <circle fill="black" r={5} cx={0} cy={0}/>
                            </g>
                        ) : null
                    }
                    <text x="20" y="20">Position: {worldOffset.x + (this.state.width / 2)} {worldOffset.y + (this.state.height / 2)}</text>
                    <text x="20" y="40">Time: {timeOfDayHour}:{timeOfDayMinute} {timeOfDayAmPm}</text>
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
                        currentPerson ? (
                            <g>
                                <text x="20" y={this.state.height - 40} fill="black" fontSize={18}>Cash: {currentPerson.cash}</text>
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
                    {
                        npc ? (
                            <g>
                                <rect x="0" y="0" width={this.state.width} height={this.state.height} fill="white" opacity="0.3"/>
                                <text x="20" y="60" fontSize="24">NPC id: {npc.id}</text>
                                <text x="20" y="100" fontSize="18" onClick={this.followNpc(npc)}>Follow</text>
                                <text x="20" y="140">NPC Inventory</text>
                                <g transform={"translate(0, 160)"}>
                                    {
                                        this.drawInventory(npc.inventory, false)
                                    }
                                </g>
                                <text x="20" y="300">Your Inventory</text>
                                <g transform={"translate(0, 320)"}>
                                    {
                                        currentPerson ? this.drawInventory(currentPerson.inventory, false) : null
                                    }
                                </g>
                            </g>
                        ) : null
                    }
                    {
                        this.state.lot ? (
                            <g>
                                <rect x="0" y="0" width={this.state.width} height={this.state.height} fill="white" opacity="0.3"/>
                                <text x="20" y="60" fontSize="24">Lot id: {this.state.lot.id}</text>
                                <text x="20" y="100" fontSize="18" onClick={
                                    this.state.lot.owner === this.state.currentPersonId ? this.sellLot(this.state.lot) : this.buyLot(this.state.lot)
                                }>{this.state.lot.owner === this.state.currentPersonId ? "Sell Offer" : "Buy Offer"}</text>
                                <foreignObject x="100" y="80" width="150" height="40">
                                    <div>
                                        <input onKeyUp={this.handleLotPrice} value={`Amount: ${this.state.lotPrice}`}/>
                                    </div>
                                </foreignObject>
                                {
                                    this.state.lot.sellOffers && this.state.lot.sellOffers[0] ? (
                                        <text x="20" y="140" fontSize="18" onClick={this.acceptBuyOffer(this.state.lot.sellOffers[0])}>{this.state.lot.sellOffers[0].personId} {this.state.lot.sellOffers[0].price} Buy</text>
                                    ) : null
                                }
                                {
                                    this.state.lot.buyOffers ? (
                                        this.state.lot.buyOffers.map((offer, i) => {
                                            return <text x="20" y={180 + i * 20} fontSize="18" onClick={this.acceptSellOffer(offer)}>{offer.personId} {offer.price} Sell</text>
                                        })
                                    ) : null
                                }
                            </g>
                        ) : null
                    }
                    {
                        this.state.inventory && this.state.showInventory ? this.drawInventory(this.state.inventory, true) : null
                    }
                    {
                        this.state.showNpcs ? (
                            <g>
                                <text x={20} y={20} fontSize={18}>NPCs</text>
                                {
                                    this.state.npcs.map((n, index) => {
                                        return (
                                            <g key={n.id} transform={`translate(20,${60 + index * 40})`}>
                                                <text x={20} y={20}>{n.id}</text>
                                                <text x={250} y={20} fill={n.job.type === ENpcJobType.GATHER ? "blue" : "black"} onClick={() => this.npcSetJob(n, ENpcJobType.GATHER)}>Gather</text>
                                                <text x={350} y={20} fill={n.job.type === ENpcJobType.CRAFT ? "blue" : "black"} onClick={() => this.npcSetJob(n, ENpcJobType.CRAFT)}>Craft</text>
                                                <text x={450} y={20} fill={n.job.type === ENpcJobType.HAUL ? "blue" : "black"} onClick={() => this.npcSetJob(n, ENpcJobType.HAUL)}>Haul</text>
                                            </g>
                                        )
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
                <div>
                    <button onClick={this.refreshNpcs}>Refresh NPCs</button>
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
                <div style={{display: 'grid', gridTemplateColumns: "repeat(3, 1fr)"}}>
                    <span>Resources: {this.state.resources.length}</span>
                    <span>Objects: {this.state.objects.length}</span>
                    <span>NPCs: {this.state.npcs.length}</span>
                    <span>Persons: {this.state.persons.length}</span>
                    <span>Stockpiles: {this.state.stockpiles.length}</span>
                    <span>Houses: {this.state.houses.length}</span>
                </div>
            </div>
        );
    }
}
