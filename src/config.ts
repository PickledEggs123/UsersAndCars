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
    const gainNode = new GainNode(audioContext, {
        gain: -10
    });
    const biquadFilterNode = new BiquadFilterNode(audioContext, {
        frequency: 1000
    });
    source.connect(gainNode);
    gainNode.connect(biquadFilterNode);
    biquadFilterNode.connect(audioContext.destination);
};