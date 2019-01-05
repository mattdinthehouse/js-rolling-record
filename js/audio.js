var audio = {
	recorder: undefined,
	context: new AudioContext({ sampleRate: 44100 }),
	stream: undefined,
	bufferLength: 0,
	chunks: [],
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
			if(audio.stream) {
				audio.stream.disconnect();
			}

			audio.stream = audio.context.createMediaStreamSource(stream);
			audio.bufferLength = 0;
			audio.chunks = [];

			for(var channel = 0; channel < controls.channels; channel++) {
				audio.chunks[channel] = [];
			}

			var scriptProcessorNode = audio.context.createScriptProcessor(4096, controls.channels, controls.channels);
			scriptProcessorNode.addEventListener('audioprocess', recordAudio);

			audio.stream.connect(scriptProcessorNode);

			window.dispatchEvent(new Event('audio.recorder.start'));

			setTimeout(function() {
				audio.stream.disconnect();
				audio.stream = undefined;
			}, 3000);
		})
		.catch(function(error) {
			alert('Unable to open audio stream');
			console.error('Unable to open audio stream', error);
		})
});

recordAudio = function(event) {
	for(var channel = 0; channel < controls.channels; channel++) {
		audio.chunks[channel].push(event.inputBuffer.getChannelData(channel));
	}

	audio.bufferLength += audio.chunks[0][audio.chunks[0].length - 1].length;

	// TODO: Trim audio from that's too old
}

window.addEventListener('controls.save', saveAudio = function() {
	// Generate the audio file
	var merged = [];
	for(var channel = 0; channel < controls.channels; channel++) {
		merged[channel] = new Float32Array(audio.bufferLength);

		for(var i = 0, offset = 0; i < audio.chunks[channel].length; i++) {
			merged[channel].set(audio.chunks[channel][i], offset);
			offset += audio.chunks[channel][i].length;
		}
	}

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
	var filename = ''+(new Date()).getTime()+'.wav';

	// Download it
	triggerDownload(blob, filename);
});

triggerDownload = function(blob, filename) {
	var a = document.createElement('a');
	a.target = '_blank';
	a.href = window.URL.createObjectURL(blob);
	a.download = filename;

	a.style = 'display:none';
	document.body.appendChild(a);

	a.click();

	window.URL.revokeObjectURL(a.href);
	document.body.removeChild(a);
}