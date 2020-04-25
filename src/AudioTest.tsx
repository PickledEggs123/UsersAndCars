import * as React from "react";
import {performAudioVolumeTest, userMediaConfig} from "./config";

interface IAudioTestProps {}

interface IAudioTestState {
    running: boolean;
    volume: number;
}

export class AudioTest extends React.Component<IAudioTestProps, IAudioTestState> {
    state = {
        running: false,
        volume: -Infinity
    };

    audioElementRef = React.createRef<HTMLAudioElement>();

    volumeTestCanceler: (() => void) | null = null;

    /**
     * Update the volume value in the state.
     * @param volume The latest volume.
     */
    getVolume = (volume: number) => {
        this.setState({
            volume
        });
    };

    /**
     * Begin the microphone volume test.
     */
    beginTest = async () => {
        // get microphone
        const stream = await navigator.mediaDevices.getUserMedia(userMediaConfig);

        // begin volume test
        this.volumeTestCanceler = await performAudioVolumeTest(stream, this.getVolume);

        if (this.audioElementRef.current) {
            // add microphone output to audio element
            this.audioElementRef.current.srcObject = stream;

            // show test as running
            this.setState({
                running: true
            });
        }
    };

    /**
     * End the microphone volume test.
     */
    endTest = () => {
        if (this.audioElementRef.current && this.audioElementRef.current.srcObject instanceof MediaStream) {
            // stop audio
            this.audioElementRef.current.srcObject.getAudioTracks().forEach(audioTrack => {
                audioTrack.stop();
            });
            this.audioElementRef.current.srcObject = null;

            this.setState({
                running: false
            });
        }

        // cancel volume test
        if (this.volumeTestCanceler) {
            this.volumeTestCanceler();
            this.volumeTestCanceler = null;
        }
    };

    /**
     * Toggle the microphone volume test.
     */
    toggleTest = () => {
        this.state.running ? this.endTest() : this.beginTest();
    };

    render() {
        return (
            <div>
                <h1>Audio Test</h1>
                <p>Click the button below to test if the microphone and speaker is working correctly.</p>
                <p>Current Volume: {this.state.volume}</p>
                <p>Please use a microphone with voice chat to prevent echo noises.</p>
                <button onClick={this.toggleTest}>{this.state.running ? "Stop" : "Test"}</button>
                <audio autoPlay ref={this.audioElementRef}/>
            </div>
        );
    }
}