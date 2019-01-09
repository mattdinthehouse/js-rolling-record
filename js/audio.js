var audio = {
	context: new AudioContext({ sampleRate: 44100 }),
	stream: undefined, // The current stream that's being recorded
	bufferLength: 0, // Number of samples
	chunkDuration: [], // Duration in seconds for each chunk
	chunks: [], // Array of channel => sample chunks
	saves: [],
};

window.addEventListener('controls.source.change', startRecordingAudio = function() {
	// Open the chosen source at 44.1k sample rate, 32-bit
	var constraints = {
		audio: {
			deviceId: controls.source,
			sampleRate: 44100,
			sampleSize: 32,
			channelCount: controls.channels,
		},
		video: false,
	};

	navigator.mediaDevices.getUserMedia(constraints)
		.then(function(stream) {
			// Stop any old streams
			if(audio.stream) {
				audio.stream.disconnect();

				window.dispatchEvent(new Event('audio.stopped'));
			}

			// Reset everything
			audio.stream = audio.context.createMediaStreamSource(stream);
			audio.bufferLength = 0;
			audio.chunkDuration = [];
			audio.chunks = [];

			for(var channel = 0; channel < controls.channels; channel++) {
				audio.chunks[channel] = [];
			}

			// Start recording
			var scriptProcessorNode = audio.context.createScriptProcessor(4096, controls.channels, controls.channels);
			scriptProcessorNode.addEventListener('audioprocess', recordAudio);

			audio.stream.connect(scriptProcessorNode);

			// Notify stuff that recording's begun
			window.dispatchEvent(new Event('audio.recording'));
		})
		.catch(function(error) {
			alert('Unable to open audio stream');
			console.error('Unable to open audio stream', error);
		})
});

recordAudio = function(event) {
	// Save the audio data
	for(var channel = 0; channel < controls.channels; channel++) {
		audio.chunks[channel].push(event.inputBuffer.getChannelData(channel));
	}

	// Increment the buffer's length (in samples) and duration (in seconds)
	audio.bufferLength += event.inputBuffer.length;
	audio.chunkDuration.push(event.inputBuffer.duration);

	// Trim audio that's too old
	var sumBufferDuration = sumOfArray(audio.chunkDuration);
	while(sumBufferDuration > controls.duration) {
		// Remove the oldest bits
		sumBufferDuration -= audio.chunkDuration.shift();
		audio.bufferLength -= audio.chunks[0].shift().length;

		// channel = 1 because 0 has already been .shift()'d
		for(var channel = 1; channel < controls.channels; channel++) {
			audio.chunks[channel].shift();
		}
	}
}

window.addEventListener('controls.save', saveAudio = function() {
	// Generate the audio file
	// 1. Merge each channel's data into a single buffer respectively
	var merged = [];
	for(var channel = 0; channel < controls.channels; channel++) {
		merged[channel] = new Float32Array(audio.bufferLength);

		for(var i = 0, offset = 0; i < audio.chunks[channel].length; i++) {
			merged[channel].set(audio.chunks[channel][i], offset);
			offset += audio.chunks[channel][i].length;
		}
	}

	// 2. Interleave the channel buffers into a single buffer
	var interleaved = new Float32Array(audio.bufferLength * controls.channels);
	for(var i = 0, j = 0; i < interleaved.length; j++) {
		for(var channel = 0; channel < controls.channels; channel++) {
			interleaved[i++] = merged[channel][j];
		}
	}

	var wavData = encodeWAV(interleaved, 44100, controls.channels);

	var blob = new Blob([wavData], {
		type: 'audio/wav',
	});

	// Generate a filename
	var filename = (new Date()).toISOString();
	filename = filename.replace('T', '_');
	filename = filename.split('.')[0];
	filename = filename.replace(/:/g, '-');
	filename = filename+'.wav';

	// Download it and save
	triggerDownload(blob, filename);
	audio.saves.push({
		data: blob,
		filename: filename,
		timestamp: new Date(),
	});

	window.dispatchEvent(new Event('audio.saved'));
});