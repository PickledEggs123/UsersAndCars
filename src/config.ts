/**
 * Global user media configuration. The app uses voice only so only audio with advanced audio features is enabled.
 */
export const userMediaConfig: MediaStreamConstraints = {
    video: false,
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleSize: 8,
        sampleRate: 44100,
        channelCount: 1
    }
};


/**
 * Global RTCPeerConnection configuration.
 */
export const rtcPeerConnectionConfiguration: RTCConfiguration = {
    iceServers: [{
        urls: [
            "turn:34.68.122.45:3478"
        ],
        credentialType: "password",
        username: "persons",
        credential: "Forward1Chat2Data3"
    }]
};

/**
 * Implement filters on the audio to improve audio quality.
 * @param stream
 */
export const applyAudioFilters = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    applyDefaultAudioFiltering(audioContext, source);
};

const waitFor = async (milliseconds: number) => {
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, milliseconds);
    });
};

/**
 * Perform a microphone test. It will test for the precense of headphones. Headphones are required to prevent a loop back
 * echo from the speaker to the microphone. This test should fail if there are no headphones and should pass if there is
 * a headphone.
 * @param stream The microphone stream.
 * @param getVolume A function to return volume over time.
 */
export const performAudioVolumeTest = async (stream: MediaStream, getVolume: (volume: number) => void) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    // create a sine wave that will echo if no headphones are present while using a microphone
    const sineWave = new OscillatorNode(audioContext, {
        frequency: 407.11,
    });
    sineWave.start();
    const mergeNode = new ChannelMergerNode(audioContext, {
        numberOfInputs: 2
    });
    source.connect(mergeNode);
    sineWave.connect(mergeNode);
    const lastNode = applyDefaultAudioFiltering(audioContext, mergeNode);

    /**
     * Create a volume reader to read the audio volume.
     */
    let volume = -Infinity;
    const readVolumeHandler = (event: AudioProcessingEvent) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const outputBuffer = event.outputBuffer.getChannelData(0);

        let loudestAmplitude = -Infinity;
        for (let i = 0; i < inputBuffer.length; i++) {
            const amplitude = inputBuffer[i];
            outputBuffer[i] = amplitude;
            if (amplitude > loudestAmplitude) {
                loudestAmplitude = amplitude;
            }
        }
        if (loudestAmplitude > volume) {
            volume = loudestAmplitude;
        }
    };
    const readVolume = audioContext.createScriptProcessor(4096, 1, 1);
    readVolume.addEventListener("audioprocess", readVolumeHandler);
    lastNode.disconnect();
    lastNode.connect(readVolume);
    readVolume.connect(audioContext.destination);

    /**
     * Get the volume at a specific interval.
     */
    let getVolumeInterval: any = setInterval(() => {
        getVolume(volume);
        volume = -Infinity;
    }, 250);

    await waitFor(2000);

    // stop sine wave
    sineWave.stop();

    /**
     * End volume test.
     */
    return () => {
        clearInterval(getVolumeInterval);
        getVolumeInterval = null;
        readVolume.removeEventListener("audioprocess", readVolumeHandler);
    };
};

const applyDefaultAudioFiltering = (audioContext: AudioContext, source: AudioNode) => {
    const gainNode = new GainNode(audioContext, {
        gain: -20
    });
    const biquadFilterNode = new BiquadFilterNode(audioContext, {
        frequency: 1000
    });
    const compressorNode = new DynamicsCompressorNode(audioContext, {
        threshold: -50,
        knee: 20,
        ratio: 12,
        attack: 0,
        release: 0.25
    });
    source.disconnect();
    source.connect(gainNode);
    gainNode.connect(biquadFilterNode);
    biquadFilterNode.connect(compressorNode);
    compressorNode.connect(audioContext.destination);
    return compressorNode;
};
