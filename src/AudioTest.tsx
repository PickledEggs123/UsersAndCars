import * as React from "react";
import {applyAudioFilters, userMediaConfig} from "./config";

interface IAudioTestProps {}

interface IAudioTestState {
    running: boolean;
}

export class AudioTest extends React.Component<IAudioTestProps, IAudioTestState> {
    state = {
        running: false
    };

    audioElementRef = React.createRef<HTMLAudioElement>();

    beginTest = async () => {
        const stream = await navigator.mediaDevices.getUserMedia(userMediaConfig);
        applyAudioFilters(stream);

        if (this.audioElementRef.current) {
            this.audioElementRef.current.srcObject = stream;

            this.setState({
                running: true
            });
        }
    };

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
    };

    toggleTest = () => {
        this.state.running ? this.endTest() : this.beginTest();
    };

    render() {
        return (
            <div>
                <h1>Audio Test</h1>
                <p>Click the button below to test if the microphone and speaker is working correctly.</p>
                <button onClick={this.toggleTest}>{this.state.running ? "Stop" : "Test"}</button>
                <audio autoPlay ref={this.audioElementRef}/>
            </div>
        );
    }
}