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
function removeAllChildren(element) {
	while(element.firstChild) {
		element.removeChild(element.firstChild);
	}
}

function removeElement(element) {
	element.parentNode.removeChild(element);
}

function sumOfArray(array) {
	return array.reduce(function(sum, value) {
		return sum + value;
	}, 0);
}

function triggerDownload(blob, filename) {
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

function encodeWAV(samples, sampleRate, numChannels) {
	// Ripped from https://github.com/mattdiamond/Recorderjs/blob/master/lib/recorder.js#L170
	var buffer = new ArrayBuffer(44 + samples.length * 2);
	var view = new DataView(buffer);

	/* RIFF identifier */
	writeString(view, 0, 'RIFF');
	/* RIFF chunk length */
	view.setUint32(4, 36 + samples.length * 2, true);
	/* RIFF type */
	writeString(view, 8, 'WAVE');
	/* format chunk identifier */
	writeString(view, 12, 'fmt ');
	/* format chunk length */
	view.setUint32(16, 16, true);
	/* sample format (raw) */
	view.setUint16(20, 1, true);
	/* channel count */
	view.setUint16(22, numChannels, true);
	/* sample rate */
	view.setUint32(24, sampleRate, true);
	/* byte rate (sample rate * block align) */
	view.setUint32(28, sampleRate * 4, true);
	/* block align (channel count * bytes per sample) */
	view.setUint16(32, numChannels * 2, true);
	/* bits per sample */
	view.setUint16(34, 16, true);
	/* data chunk identifier */
	writeString(view, 36, 'data');
	/* data chunk length */
	view.setUint32(40, samples.length * 2, true);

	floatTo16BitPCM(view, 44, samples);

	return view;
}

function floatTo16BitPCM(output, offset, input) {
	// Ripped from https://github.com/mattdiamond/Recorderjs/blob/master/lib/recorder.js#L157
	for (var i = 0; i < input.length; i++, offset += 2) {
		var s = Math.max(-1, Math.min(1, input[i]));
		output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
	}
}

function writeString(view, offset, string) {
	// Ripped from https://github.com/mattdiamond/Recorderjs/blob/master/lib/recorder.js#L164
	for (var i = 0; i < string.length; i++) {
		view.setUint8(offset + i, string.charCodeAt(i));
	}
}
var controls = {
	source: undefined,
	duration: undefined,
	channels: undefined,
};

var controlElements = {
	source: document.getElementById('audio-source'),
	duration: document.getElementById('audio-duration'),
	channels: document.getElementById('audio-channels'),
	save: document.getElementById('audio-save'),
}

populateAudioSources = function() {
	navigator.mediaDevices.enumerateDevices()
		.then(function(devices) {
			// Filter to valid devices
			var audioDevices = devices.filter(function(device) {
				return device.kind == 'audioinput';
			});

			// Re-populate the source selector options
			removeAllChildren(controlElements.source);

			audioDevices.forEach(function(device) {
				// Create an <option>
				var deviceOption = document.createElement('option');
				deviceOption.value = device.deviceId;
				deviceOption.textContent = (device.label ? device.label : device.deviceId);

				controlElements.source.appendChild(deviceOption);

				if(device.deviceId == controls.source) {
					// This is the active source so make sure the selector matches
					controlElements.source.value = deviceOption.value;
				}
			});

			// Trigger a change event so the active source matches the selector
			controlElements.source.dispatchEvent(new Event('change'));
		})
		.catch(function(error) {
			alert('Unable to fetch audio devices');
			console.error('Unabled to fetch audio devices', error);
		})
}();

controlElements.source.addEventListener('change', changeAudioSource = function(event) {
	var chosenSource = controlElements.source.value;

	if(chosenSource != controls.source) {
		// Different source has been chosen, trigger updates
		controls.source = chosenSource;

		window.dispatchEvent(new Event('controls.source.change'));
	}
});

var _durationChangeTimeout = undefined;
changeAudioDuration = function(event) {
	// _durationChangeTimeout is a global that's effectively debouncing this function
	if(_durationChangeTimeout !== undefined) {
		clearTimeout(_durationChangeTimeout);
	}

	_durationChangeTimeout = setTimeout(function() {
		_durationChangeTimeout = undefined;

		var chosenDuration = controlElements.duration.value;

		if(chosenDuration != controls.duration) {
			// Different duration has been entered, trigger updates
			controls.duration = chosenDuration;

			window.dispatchEvent(new Event('controls.duration.change'));
		}
	}, 500);
}();
controlElements.duration.addEventListener('input', changeAudioDuration);

var _channelsChangeTimeout = undefined;
changeAudioDuration = function(event) {
	// _channelsChangeTimeout is a global that's effectively debouncing this function
	if(_channelsChangeTimeout !== undefined) {
		clearTimeout(_channelsChangeTimeout);
	}

	_channelsChangeTimeout = setTimeout(function() {
		_channelsChangeTimeout = undefined;

		var chosenChannels = controlElements.channels.value;

		if(chosenChannels != controls.channels) {
			// Different channels has been entered, trigger updates
			controls.channels = chosenChannels;

			window.dispatchEvent(new Event('controls.channels.change'));
		}
	}, 500);
}();
controlElements.channels.addEventListener('input', changeAudioDuration);

window.addEventListener('audio.recording', enableSaveAudio = function() {
	controlElements.save.disabled = false;
});

controlElements.save.addEventListener('click', clickSaveAudio = function() {
	window.dispatchEvent(new Event('controls.save'));
});
var logElements = {
	tableBody: document.getElementById('log__body'),
	tableNoAudio: document.getElementById('log__no-audio'),
	clearButton: document.getElementById('log__clear'),
};

window.addEventListener('audio.saved', updateLogTable = function() {
	if(!audio.saves.length) {
		return;
	}

	// Remove the "no saves" notice
	logElements.tableNoAudio.style = 'display:none';

	// Add the latest save
	var latestSaveIndex = audio.saves.length - 1;
	var latestSave = audio.saves[latestSaveIndex];

	var row = document.createElement('tr');
	row.saveIndex = latestSaveIndex;
	row.innerHTML = `
		<td class="text-nowrap pr-2">
			${latestSave.timestamp.toLocaleString()}
		</td>
		<td class="text-nowrap">
			${latestSave.filename}
		</td>
		<td class="text-nowrap pl-2">
			<button type="button" data-action="download" class="btn btn-success btn-sm">Download</button>
		</td>
	`;

	logElements.tableBody.appendChild(row);
});

logElements.tableBody.addEventListener('click', downloadSavedAudio = function(event) {
	if(event.target && event.target.matches('[data-action="download"]')) {
		// Find the save and download it
		var row = event.target.closest('tr');
		var save = audio.saves[row.saveIndex];

		triggerDownload(save.data, save.filename);
	}
});

logElements.clearButton.addEventListener('click', clearSavedAudio = function(event) {
	// Clear the save data
	audio.saves = [];

	// Reset the log table
	Array.from(logElements.tableBody.querySelectorAll('tr:not(#log__no-audio)')).map(removeElement);

	logElements.tableNoAudio.style = '';
});
var visualiser = {
	analyser: undefined,
	canvas: document.getElementById('visualiser'),
	canvasContext: document.getElementById('visualiser').getContext('2d'),
};

// Most of this file was ripped from https://github.com/mdn/web-dictaphone/blob/gh-pages/scripts/app.js#L117

window.addEventListener('audio.recording', function() {
	// Create the analyser
	visualiser.analyser = audio.context.createAnalyser(audio.stream);
	visualiser.analyser.fftSize = 2048;

	// Create the waveform data buffer
	visualiser.bufferLength = visualiser.analyser.frequencyBinCount;
	visualiser.data = new Uint8Array(visualiser.bufferLength);

	audio.stream.connect(visualiser.analyser);

	// Start drawing
	drawVisualiser();
});

drawVisualiser = function() {
	// Queue the next frame
	requestAnimationFrame(drawVisualiser);

	// Fetch the waveform data
	visualiser.analyser.getByteTimeDomainData(visualiser.data);

	// Reset the canvas
	visualiser.canvas.width = visualiser.canvas.offsetWidth;

	var width = visualiser.canvas.width;
	var height = visualiser.canvas.height;

	visualiser.canvasContext.fillStyle = 'rgb(200, 200, 200)';
	visualiser.canvasContext.fillRect(0, 0, width, height);

	visualiser.canvasContext.lineWidth = 2;
	visualiser.canvasContext.strokeStyle = 'rgb(0, 0, 0)';

	// Begin drawing the waveform
	visualiser.canvasContext.beginPath();
	visualiser.canvasContext.moveTo(0, height / 2);

	var sliceWidth = width * (1.0 / visualiser.bufferLength);

	for(var i = 0, x = 0; i < visualiser.bufferLength; i++, x += sliceWidth) {
		var v = visualiser.data[i] / 128.0;
		var y = v * (height / 2);

		visualiser.canvasContext.lineTo(x, y);
	}

	visualiser.canvasContext.lineTo(width, height / 2);
	visualiser.canvasContext.stroke();
};
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImF1ZGlvLmpzIiwiY29tbW9uLmpzIiwiY29udHJvbHMuanMiLCJsb2cuanMiLCJ2aXN1YWxpc2VyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzFIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzVHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoic2NyaXB0cy5qcyIsInNvdXJjZXNDb250ZW50IjpbInZhciBhdWRpbyA9IHtcblx0Y29udGV4dDogbmV3IEF1ZGlvQ29udGV4dCh7IHNhbXBsZVJhdGU6IDQ0MTAwIH0pLFxuXHRzdHJlYW06IHVuZGVmaW5lZCwgLy8gVGhlIGN1cnJlbnQgc3RyZWFtIHRoYXQncyBiZWluZyByZWNvcmRlZFxuXHRidWZmZXJMZW5ndGg6IDAsIC8vIE51bWJlciBvZiBzYW1wbGVzXG5cdGNodW5rRHVyYXRpb246IFtdLCAvLyBEdXJhdGlvbiBpbiBzZWNvbmRzIGZvciBlYWNoIGNodW5rXG5cdGNodW5rczogW10sIC8vIEFycmF5IG9mIGNoYW5uZWwgPT4gc2FtcGxlIGNodW5rc1xuXHRzYXZlczogW10sXG59O1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY29udHJvbHMuc291cmNlLmNoYW5nZScsIHN0YXJ0UmVjb3JkaW5nQXVkaW8gPSBmdW5jdGlvbigpIHtcblx0Ly8gT3BlbiB0aGUgY2hvc2VuIHNvdXJjZSBhdCA0NC4xayBzYW1wbGUgcmF0ZSwgMzItYml0XG5cdHZhciBjb25zdHJhaW50cyA9IHtcblx0XHRhdWRpbzoge1xuXHRcdFx0ZGV2aWNlSWQ6IGNvbnRyb2xzLnNvdXJjZSxcblx0XHRcdHNhbXBsZVJhdGU6IDQ0MTAwLFxuXHRcdFx0c2FtcGxlU2l6ZTogMzIsXG5cdFx0XHRjaGFubmVsQ291bnQ6IGNvbnRyb2xzLmNoYW5uZWxzLFxuXHRcdH0sXG5cdFx0dmlkZW86IGZhbHNlLFxuXHR9O1xuXG5cdG5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0VXNlck1lZGlhKGNvbnN0cmFpbnRzKVxuXHRcdC50aGVuKGZ1bmN0aW9uKHN0cmVhbSkge1xuXHRcdFx0Ly8gU3RvcCBhbnkgb2xkIHN0cmVhbXNcblx0XHRcdGlmKGF1ZGlvLnN0cmVhbSkge1xuXHRcdFx0XHRhdWRpby5zdHJlYW0uZGlzY29ubmVjdCgpO1xuXG5cdFx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYXVkaW8uc3RvcHBlZCcpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzZXQgZXZlcnl0aGluZ1xuXHRcdFx0YXVkaW8uc3RyZWFtID0gYXVkaW8uY29udGV4dC5jcmVhdGVNZWRpYVN0cmVhbVNvdXJjZShzdHJlYW0pO1xuXHRcdFx0YXVkaW8uYnVmZmVyTGVuZ3RoID0gMDtcblx0XHRcdGF1ZGlvLmNodW5rRHVyYXRpb24gPSBbXTtcblx0XHRcdGF1ZGlvLmNodW5rcyA9IFtdO1xuXG5cdFx0XHRmb3IodmFyIGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgY29udHJvbHMuY2hhbm5lbHM7IGNoYW5uZWwrKykge1xuXHRcdFx0XHRhdWRpby5jaHVua3NbY2hhbm5lbF0gPSBbXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3RhcnQgcmVjb3JkaW5nXG5cdFx0XHR2YXIgc2NyaXB0UHJvY2Vzc29yTm9kZSA9IGF1ZGlvLmNvbnRleHQuY3JlYXRlU2NyaXB0UHJvY2Vzc29yKDQwOTYsIGNvbnRyb2xzLmNoYW5uZWxzLCBjb250cm9scy5jaGFubmVscyk7XG5cdFx0XHRzY3JpcHRQcm9jZXNzb3JOb2RlLmFkZEV2ZW50TGlzdGVuZXIoJ2F1ZGlvcHJvY2VzcycsIHJlY29yZEF1ZGlvKTtcblxuXHRcdFx0YXVkaW8uc3RyZWFtLmNvbm5lY3Qoc2NyaXB0UHJvY2Vzc29yTm9kZSk7XG5cblx0XHRcdC8vIE5vdGlmeSBzdHVmZiB0aGF0IHJlY29yZGluZydzIGJlZ3VuXG5cdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2F1ZGlvLnJlY29yZGluZycpKTtcblx0XHR9KVxuXHRcdC5jYXRjaChmdW5jdGlvbihlcnJvcikge1xuXHRcdFx0YWxlcnQoJ1VuYWJsZSB0byBvcGVuIGF1ZGlvIHN0cmVhbScpO1xuXHRcdFx0Y29uc29sZS5lcnJvcignVW5hYmxlIHRvIG9wZW4gYXVkaW8gc3RyZWFtJywgZXJyb3IpO1xuXHRcdH0pXG59KTtcblxucmVjb3JkQXVkaW8gPSBmdW5jdGlvbihldmVudCkge1xuXHQvLyBTYXZlIHRoZSBhdWRpbyBkYXRhXG5cdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0YXVkaW8uY2h1bmtzW2NoYW5uZWxdLnB1c2goZXZlbnQuaW5wdXRCdWZmZXIuZ2V0Q2hhbm5lbERhdGEoY2hhbm5lbCkpO1xuXHR9XG5cblx0Ly8gSW5jcmVtZW50IHRoZSBidWZmZXIncyBsZW5ndGggKGluIHNhbXBsZXMpIGFuZCBkdXJhdGlvbiAoaW4gc2Vjb25kcylcblx0YXVkaW8uYnVmZmVyTGVuZ3RoICs9IGV2ZW50LmlucHV0QnVmZmVyLmxlbmd0aDtcblx0YXVkaW8uY2h1bmtEdXJhdGlvbi5wdXNoKGV2ZW50LmlucHV0QnVmZmVyLmR1cmF0aW9uKTtcblxuXHQvLyBUcmltIGF1ZGlvIHRoYXQncyB0b28gb2xkXG5cdHZhciBzdW1CdWZmZXJEdXJhdGlvbiA9IHN1bU9mQXJyYXkoYXVkaW8uY2h1bmtEdXJhdGlvbik7XG5cdHdoaWxlKHN1bUJ1ZmZlckR1cmF0aW9uID4gY29udHJvbHMuZHVyYXRpb24pIHtcblx0XHQvLyBSZW1vdmUgdGhlIG9sZGVzdCBiaXRzXG5cdFx0c3VtQnVmZmVyRHVyYXRpb24gLT0gYXVkaW8uY2h1bmtEdXJhdGlvbi5zaGlmdCgpO1xuXHRcdGF1ZGlvLmJ1ZmZlckxlbmd0aCAtPSBhdWRpby5jaHVua3NbMF0uc2hpZnQoKS5sZW5ndGg7XG5cblx0XHQvLyBjaGFubmVsID0gMSBiZWNhdXNlIDAgaGFzIGFscmVhZHkgYmVlbiAuc2hpZnQoKSdkXG5cdFx0Zm9yKHZhciBjaGFubmVsID0gMTsgY2hhbm5lbCA8IGNvbnRyb2xzLmNoYW5uZWxzOyBjaGFubmVsKyspIHtcblx0XHRcdGF1ZGlvLmNodW5rc1tjaGFubmVsXS5zaGlmdCgpO1xuXHRcdH1cblx0fVxufVxuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY29udHJvbHMuc2F2ZScsIHNhdmVBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHQvLyBHZW5lcmF0ZSB0aGUgYXVkaW8gZmlsZVxuXHQvLyAxLiBNZXJnZSBlYWNoIGNoYW5uZWwncyBkYXRhIGludG8gYSBzaW5nbGUgYnVmZmVyIHJlc3BlY3RpdmVseVxuXHR2YXIgbWVyZ2VkID0gW107XG5cdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0bWVyZ2VkW2NoYW5uZWxdID0gbmV3IEZsb2F0MzJBcnJheShhdWRpby5idWZmZXJMZW5ndGgpO1xuXG5cdFx0Zm9yKHZhciBpID0gMCwgb2Zmc2V0ID0gMDsgaSA8IGF1ZGlvLmNodW5rc1tjaGFubmVsXS5sZW5ndGg7IGkrKykge1xuXHRcdFx0bWVyZ2VkW2NoYW5uZWxdLnNldChhdWRpby5jaHVua3NbY2hhbm5lbF1baV0sIG9mZnNldCk7XG5cdFx0XHRvZmZzZXQgKz0gYXVkaW8uY2h1bmtzW2NoYW5uZWxdW2ldLmxlbmd0aDtcblx0XHR9XG5cdH1cblxuXHQvLyAyLiBJbnRlcmxlYXZlIHRoZSBjaGFubmVsIGJ1ZmZlcnMgaW50byBhIHNpbmdsZSBidWZmZXJcblx0dmFyIGludGVybGVhdmVkID0gbmV3IEZsb2F0MzJBcnJheShhdWRpby5idWZmZXJMZW5ndGggKiBjb250cm9scy5jaGFubmVscyk7XG5cdGZvcih2YXIgaSA9IDAsIGogPSAwOyBpIDwgaW50ZXJsZWF2ZWQubGVuZ3RoOyBqKyspIHtcblx0XHRmb3IodmFyIGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgY29udHJvbHMuY2hhbm5lbHM7IGNoYW5uZWwrKykge1xuXHRcdFx0aW50ZXJsZWF2ZWRbaSsrXSA9IG1lcmdlZFtjaGFubmVsXVtqXTtcblx0XHR9XG5cdH1cblxuXHR2YXIgd2F2RGF0YSA9IGVuY29kZVdBVihpbnRlcmxlYXZlZCwgNDQxMDAsIGNvbnRyb2xzLmNoYW5uZWxzKTtcblxuXHR2YXIgYmxvYiA9IG5ldyBCbG9iKFt3YXZEYXRhXSwge1xuXHRcdHR5cGU6ICdhdWRpby93YXYnLFxuXHR9KTtcblxuXHQvLyBHZW5lcmF0ZSBhIGZpbGVuYW1lXG5cdHZhciBmaWxlbmFtZSA9IChuZXcgRGF0ZSgpKS50b0lTT1N0cmluZygpO1xuXHRmaWxlbmFtZSA9IGZpbGVuYW1lLnJlcGxhY2UoJ1QnLCAnXycpO1xuXHRmaWxlbmFtZSA9IGZpbGVuYW1lLnNwbGl0KCcuJylbMF07XG5cdGZpbGVuYW1lID0gZmlsZW5hbWUucmVwbGFjZSgvOi9nLCAnLScpO1xuXHRmaWxlbmFtZSA9IGZpbGVuYW1lKycud2F2JztcblxuXHQvLyBEb3dubG9hZCBpdCBhbmQgc2F2ZVxuXHR0cmlnZ2VyRG93bmxvYWQoYmxvYiwgZmlsZW5hbWUpO1xuXHRhdWRpby5zYXZlcy5wdXNoKHtcblx0XHRkYXRhOiBibG9iLFxuXHRcdGZpbGVuYW1lOiBmaWxlbmFtZSxcblx0XHR0aW1lc3RhbXA6IG5ldyBEYXRlKCksXG5cdH0pO1xuXG5cdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYXVkaW8uc2F2ZWQnKSk7XG59KTsiLCJmdW5jdGlvbiByZW1vdmVBbGxDaGlsZHJlbihlbGVtZW50KSB7XG5cdHdoaWxlKGVsZW1lbnQuZmlyc3RDaGlsZCkge1xuXHRcdGVsZW1lbnQucmVtb3ZlQ2hpbGQoZWxlbWVudC5maXJzdENoaWxkKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW1vdmVFbGVtZW50KGVsZW1lbnQpIHtcblx0ZWxlbWVudC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGVsZW1lbnQpO1xufVxuXG5mdW5jdGlvbiBzdW1PZkFycmF5KGFycmF5KSB7XG5cdHJldHVybiBhcnJheS5yZWR1Y2UoZnVuY3Rpb24oc3VtLCB2YWx1ZSkge1xuXHRcdHJldHVybiBzdW0gKyB2YWx1ZTtcblx0fSwgMCk7XG59XG5cbmZ1bmN0aW9uIHRyaWdnZXJEb3dubG9hZChibG9iLCBmaWxlbmFtZSkge1xuXHR2YXIgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0YS50YXJnZXQgPSAnX2JsYW5rJztcblx0YS5ocmVmID0gd2luZG93LlVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG5cdGEuZG93bmxvYWQgPSBmaWxlbmFtZTtcblxuXHRhLnN0eWxlID0gJ2Rpc3BsYXk6bm9uZSc7XG5cdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYSk7XG5cblx0YS5jbGljaygpO1xuXG5cdHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKGEuaHJlZik7XG5cdGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYSk7XG59XG5cbmZ1bmN0aW9uIGVuY29kZVdBVihzYW1wbGVzLCBzYW1wbGVSYXRlLCBudW1DaGFubmVscykge1xuXHQvLyBSaXBwZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbWF0dGRpYW1vbmQvUmVjb3JkZXJqcy9ibG9iL21hc3Rlci9saWIvcmVjb3JkZXIuanMjTDE3MFxuXHR2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDQ0ICsgc2FtcGxlcy5sZW5ndGggKiAyKTtcblx0dmFyIHZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmZmVyKTtcblxuXHQvKiBSSUZGIGlkZW50aWZpZXIgKi9cblx0d3JpdGVTdHJpbmcodmlldywgMCwgJ1JJRkYnKTtcblx0LyogUklGRiBjaHVuayBsZW5ndGggKi9cblx0dmlldy5zZXRVaW50MzIoNCwgMzYgKyBzYW1wbGVzLmxlbmd0aCAqIDIsIHRydWUpO1xuXHQvKiBSSUZGIHR5cGUgKi9cblx0d3JpdGVTdHJpbmcodmlldywgOCwgJ1dBVkUnKTtcblx0LyogZm9ybWF0IGNodW5rIGlkZW50aWZpZXIgKi9cblx0d3JpdGVTdHJpbmcodmlldywgMTIsICdmbXQgJyk7XG5cdC8qIGZvcm1hdCBjaHVuayBsZW5ndGggKi9cblx0dmlldy5zZXRVaW50MzIoMTYsIDE2LCB0cnVlKTtcblx0Lyogc2FtcGxlIGZvcm1hdCAocmF3KSAqL1xuXHR2aWV3LnNldFVpbnQxNigyMCwgMSwgdHJ1ZSk7XG5cdC8qIGNoYW5uZWwgY291bnQgKi9cblx0dmlldy5zZXRVaW50MTYoMjIsIG51bUNoYW5uZWxzLCB0cnVlKTtcblx0Lyogc2FtcGxlIHJhdGUgKi9cblx0dmlldy5zZXRVaW50MzIoMjQsIHNhbXBsZVJhdGUsIHRydWUpO1xuXHQvKiBieXRlIHJhdGUgKHNhbXBsZSByYXRlICogYmxvY2sgYWxpZ24pICovXG5cdHZpZXcuc2V0VWludDMyKDI4LCBzYW1wbGVSYXRlICogNCwgdHJ1ZSk7XG5cdC8qIGJsb2NrIGFsaWduIChjaGFubmVsIGNvdW50ICogYnl0ZXMgcGVyIHNhbXBsZSkgKi9cblx0dmlldy5zZXRVaW50MTYoMzIsIG51bUNoYW5uZWxzICogMiwgdHJ1ZSk7XG5cdC8qIGJpdHMgcGVyIHNhbXBsZSAqL1xuXHR2aWV3LnNldFVpbnQxNigzNCwgMTYsIHRydWUpO1xuXHQvKiBkYXRhIGNodW5rIGlkZW50aWZpZXIgKi9cblx0d3JpdGVTdHJpbmcodmlldywgMzYsICdkYXRhJyk7XG5cdC8qIGRhdGEgY2h1bmsgbGVuZ3RoICovXG5cdHZpZXcuc2V0VWludDMyKDQwLCBzYW1wbGVzLmxlbmd0aCAqIDIsIHRydWUpO1xuXG5cdGZsb2F0VG8xNkJpdFBDTSh2aWV3LCA0NCwgc2FtcGxlcyk7XG5cblx0cmV0dXJuIHZpZXc7XG59XG5cbmZ1bmN0aW9uIGZsb2F0VG8xNkJpdFBDTShvdXRwdXQsIG9mZnNldCwgaW5wdXQpIHtcblx0Ly8gUmlwcGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21hdHRkaWFtb25kL1JlY29yZGVyanMvYmxvYi9tYXN0ZXIvbGliL3JlY29yZGVyLmpzI0wxNTdcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKywgb2Zmc2V0ICs9IDIpIHtcblx0XHR2YXIgcyA9IE1hdGgubWF4KC0xLCBNYXRoLm1pbigxLCBpbnB1dFtpXSkpO1xuXHRcdG91dHB1dC5zZXRJbnQxNihvZmZzZXQsIHMgPCAwID8gcyAqIDB4ODAwMCA6IHMgKiAweDdGRkYsIHRydWUpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHdyaXRlU3RyaW5nKHZpZXcsIG9mZnNldCwgc3RyaW5nKSB7XG5cdC8vIFJpcHBlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXR0ZGlhbW9uZC9SZWNvcmRlcmpzL2Jsb2IvbWFzdGVyL2xpYi9yZWNvcmRlci5qcyNMMTY0XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgc3RyaW5nLmxlbmd0aDsgaSsrKSB7XG5cdFx0dmlldy5zZXRVaW50OChvZmZzZXQgKyBpLCBzdHJpbmcuY2hhckNvZGVBdChpKSk7XG5cdH1cbn0iLCJ2YXIgY29udHJvbHMgPSB7XG5cdHNvdXJjZTogdW5kZWZpbmVkLFxuXHRkdXJhdGlvbjogdW5kZWZpbmVkLFxuXHRjaGFubmVsczogdW5kZWZpbmVkLFxufTtcblxudmFyIGNvbnRyb2xFbGVtZW50cyA9IHtcblx0c291cmNlOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXVkaW8tc291cmNlJyksXG5cdGR1cmF0aW9uOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXVkaW8tZHVyYXRpb24nKSxcblx0Y2hhbm5lbHM6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1jaGFubmVscycpLFxuXHRzYXZlOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXVkaW8tc2F2ZScpLFxufVxuXG5wb3B1bGF0ZUF1ZGlvU291cmNlcyA9IGZ1bmN0aW9uKCkge1xuXHRuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmVudW1lcmF0ZURldmljZXMoKVxuXHRcdC50aGVuKGZ1bmN0aW9uKGRldmljZXMpIHtcblx0XHRcdC8vIEZpbHRlciB0byB2YWxpZCBkZXZpY2VzXG5cdFx0XHR2YXIgYXVkaW9EZXZpY2VzID0gZGV2aWNlcy5maWx0ZXIoZnVuY3Rpb24oZGV2aWNlKSB7XG5cdFx0XHRcdHJldHVybiBkZXZpY2Uua2luZCA9PSAnYXVkaW9pbnB1dCc7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUmUtcG9wdWxhdGUgdGhlIHNvdXJjZSBzZWxlY3RvciBvcHRpb25zXG5cdFx0XHRyZW1vdmVBbGxDaGlsZHJlbihjb250cm9sRWxlbWVudHMuc291cmNlKTtcblxuXHRcdFx0YXVkaW9EZXZpY2VzLmZvckVhY2goZnVuY3Rpb24oZGV2aWNlKSB7XG5cdFx0XHRcdC8vIENyZWF0ZSBhbiA8b3B0aW9uPlxuXHRcdFx0XHR2YXIgZGV2aWNlT3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG5cdFx0XHRcdGRldmljZU9wdGlvbi52YWx1ZSA9IGRldmljZS5kZXZpY2VJZDtcblx0XHRcdFx0ZGV2aWNlT3B0aW9uLnRleHRDb250ZW50ID0gKGRldmljZS5sYWJlbCA/IGRldmljZS5sYWJlbCA6IGRldmljZS5kZXZpY2VJZCk7XG5cblx0XHRcdFx0Y29udHJvbEVsZW1lbnRzLnNvdXJjZS5hcHBlbmRDaGlsZChkZXZpY2VPcHRpb24pO1xuXG5cdFx0XHRcdGlmKGRldmljZS5kZXZpY2VJZCA9PSBjb250cm9scy5zb3VyY2UpIHtcblx0XHRcdFx0XHQvLyBUaGlzIGlzIHRoZSBhY3RpdmUgc291cmNlIHNvIG1ha2Ugc3VyZSB0aGUgc2VsZWN0b3IgbWF0Y2hlc1xuXHRcdFx0XHRcdGNvbnRyb2xFbGVtZW50cy5zb3VyY2UudmFsdWUgPSBkZXZpY2VPcHRpb24udmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIGEgY2hhbmdlIGV2ZW50IHNvIHRoZSBhY3RpdmUgc291cmNlIG1hdGNoZXMgdGhlIHNlbGVjdG9yXG5cdFx0XHRjb250cm9sRWxlbWVudHMuc291cmNlLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG5cdFx0fSlcblx0XHQuY2F0Y2goZnVuY3Rpb24oZXJyb3IpIHtcblx0XHRcdGFsZXJ0KCdVbmFibGUgdG8gZmV0Y2ggYXVkaW8gZGV2aWNlcycpO1xuXHRcdFx0Y29uc29sZS5lcnJvcignVW5hYmxlZCB0byBmZXRjaCBhdWRpbyBkZXZpY2VzJywgZXJyb3IpO1xuXHRcdH0pXG59KCk7XG5cbmNvbnRyb2xFbGVtZW50cy5zb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgY2hhbmdlQXVkaW9Tb3VyY2UgPSBmdW5jdGlvbihldmVudCkge1xuXHR2YXIgY2hvc2VuU291cmNlID0gY29udHJvbEVsZW1lbnRzLnNvdXJjZS52YWx1ZTtcblxuXHRpZihjaG9zZW5Tb3VyY2UgIT0gY29udHJvbHMuc291cmNlKSB7XG5cdFx0Ly8gRGlmZmVyZW50IHNvdXJjZSBoYXMgYmVlbiBjaG9zZW4sIHRyaWdnZXIgdXBkYXRlc1xuXHRcdGNvbnRyb2xzLnNvdXJjZSA9IGNob3NlblNvdXJjZTtcblxuXHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29udHJvbHMuc291cmNlLmNoYW5nZScpKTtcblx0fVxufSk7XG5cbnZhciBfZHVyYXRpb25DaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuY2hhbmdlQXVkaW9EdXJhdGlvbiA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdC8vIF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgaXMgYSBnbG9iYWwgdGhhdCdzIGVmZmVjdGl2ZWx5IGRlYm91bmNpbmcgdGhpcyBmdW5jdGlvblxuXHRpZihfZHVyYXRpb25DaGFuZ2VUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRjbGVhclRpbWVvdXQoX2R1cmF0aW9uQ2hhbmdlVGltZW91dCk7XG5cdH1cblxuXHRfZHVyYXRpb25DaGFuZ2VUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRfZHVyYXRpb25DaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXG5cdFx0dmFyIGNob3NlbkR1cmF0aW9uID0gY29udHJvbEVsZW1lbnRzLmR1cmF0aW9uLnZhbHVlO1xuXG5cdFx0aWYoY2hvc2VuRHVyYXRpb24gIT0gY29udHJvbHMuZHVyYXRpb24pIHtcblx0XHRcdC8vIERpZmZlcmVudCBkdXJhdGlvbiBoYXMgYmVlbiBlbnRlcmVkLCB0cmlnZ2VyIHVwZGF0ZXNcblx0XHRcdGNvbnRyb2xzLmR1cmF0aW9uID0gY2hvc2VuRHVyYXRpb247XG5cblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29udHJvbHMuZHVyYXRpb24uY2hhbmdlJykpO1xuXHRcdH1cblx0fSwgNTAwKTtcbn0oKTtcbmNvbnRyb2xFbGVtZW50cy5kdXJhdGlvbi5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGNoYW5nZUF1ZGlvRHVyYXRpb24pO1xuXG52YXIgX2NoYW5uZWxzQ2hhbmdlVGltZW91dCA9IHVuZGVmaW5lZDtcbmNoYW5nZUF1ZGlvRHVyYXRpb24gPSBmdW5jdGlvbihldmVudCkge1xuXHQvLyBfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0IGlzIGEgZ2xvYmFsIHRoYXQncyBlZmZlY3RpdmVseSBkZWJvdW5jaW5nIHRoaXMgZnVuY3Rpb25cblx0aWYoX2NoYW5uZWxzQ2hhbmdlVGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y2xlYXJUaW1lb3V0KF9jaGFubmVsc0NoYW5nZVRpbWVvdXQpO1xuXHR9XG5cblx0X2NoYW5uZWxzQ2hhbmdlVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0X2NoYW5uZWxzQ2hhbmdlVGltZW91dCA9IHVuZGVmaW5lZDtcblxuXHRcdHZhciBjaG9zZW5DaGFubmVscyA9IGNvbnRyb2xFbGVtZW50cy5jaGFubmVscy52YWx1ZTtcblxuXHRcdGlmKGNob3NlbkNoYW5uZWxzICE9IGNvbnRyb2xzLmNoYW5uZWxzKSB7XG5cdFx0XHQvLyBEaWZmZXJlbnQgY2hhbm5lbHMgaGFzIGJlZW4gZW50ZXJlZCwgdHJpZ2dlciB1cGRhdGVzXG5cdFx0XHRjb250cm9scy5jaGFubmVscyA9IGNob3NlbkNoYW5uZWxzO1xuXG5cdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbnRyb2xzLmNoYW5uZWxzLmNoYW5nZScpKTtcblx0XHR9XG5cdH0sIDUwMCk7XG59KCk7XG5jb250cm9sRWxlbWVudHMuY2hhbm5lbHMuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBjaGFuZ2VBdWRpb0R1cmF0aW9uKTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2F1ZGlvLnJlY29yZGluZycsIGVuYWJsZVNhdmVBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHRjb250cm9sRWxlbWVudHMuc2F2ZS5kaXNhYmxlZCA9IGZhbHNlO1xufSk7XG5cbmNvbnRyb2xFbGVtZW50cy5zYXZlLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xpY2tTYXZlQXVkaW8gPSBmdW5jdGlvbigpIHtcblx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjb250cm9scy5zYXZlJykpO1xufSk7IiwidmFyIGxvZ0VsZW1lbnRzID0ge1xuXHR0YWJsZUJvZHk6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dfX2JvZHknKSxcblx0dGFibGVOb0F1ZGlvOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nX19uby1hdWRpbycpLFxuXHRjbGVhckJ1dHRvbjogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ19fY2xlYXInKSxcbn07XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdhdWRpby5zYXZlZCcsIHVwZGF0ZUxvZ1RhYmxlID0gZnVuY3Rpb24oKSB7XG5cdGlmKCFhdWRpby5zYXZlcy5sZW5ndGgpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBSZW1vdmUgdGhlIFwibm8gc2F2ZXNcIiBub3RpY2Vcblx0bG9nRWxlbWVudHMudGFibGVOb0F1ZGlvLnN0eWxlID0gJ2Rpc3BsYXk6bm9uZSc7XG5cblx0Ly8gQWRkIHRoZSBsYXRlc3Qgc2F2ZVxuXHR2YXIgbGF0ZXN0U2F2ZUluZGV4ID0gYXVkaW8uc2F2ZXMubGVuZ3RoIC0gMTtcblx0dmFyIGxhdGVzdFNhdmUgPSBhdWRpby5zYXZlc1tsYXRlc3RTYXZlSW5kZXhdO1xuXG5cdHZhciByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0cicpO1xuXHRyb3cuc2F2ZUluZGV4ID0gbGF0ZXN0U2F2ZUluZGV4O1xuXHRyb3cuaW5uZXJIVE1MID0gYFxuXHRcdDx0ZCBjbGFzcz1cInRleHQtbm93cmFwIHByLTJcIj5cblx0XHRcdCR7bGF0ZXN0U2F2ZS50aW1lc3RhbXAudG9Mb2NhbGVTdHJpbmcoKX1cblx0XHQ8L3RkPlxuXHRcdDx0ZCBjbGFzcz1cInRleHQtbm93cmFwXCI+XG5cdFx0XHQke2xhdGVzdFNhdmUuZmlsZW5hbWV9XG5cdFx0PC90ZD5cblx0XHQ8dGQgY2xhc3M9XCJ0ZXh0LW5vd3JhcCBwbC0yXCI+XG5cdFx0XHQ8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBkYXRhLWFjdGlvbj1cImRvd25sb2FkXCIgY2xhc3M9XCJidG4gYnRuLXN1Y2Nlc3MgYnRuLXNtXCI+RG93bmxvYWQ8L2J1dHRvbj5cblx0XHQ8L3RkPlxuXHRgO1xuXG5cdGxvZ0VsZW1lbnRzLnRhYmxlQm9keS5hcHBlbmRDaGlsZChyb3cpO1xufSk7XG5cbmxvZ0VsZW1lbnRzLnRhYmxlQm9keS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGRvd25sb2FkU2F2ZWRBdWRpbyA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdGlmKGV2ZW50LnRhcmdldCAmJiBldmVudC50YXJnZXQubWF0Y2hlcygnW2RhdGEtYWN0aW9uPVwiZG93bmxvYWRcIl0nKSkge1xuXHRcdC8vIEZpbmQgdGhlIHNhdmUgYW5kIGRvd25sb2FkIGl0XG5cdFx0dmFyIHJvdyA9IGV2ZW50LnRhcmdldC5jbG9zZXN0KCd0cicpO1xuXHRcdHZhciBzYXZlID0gYXVkaW8uc2F2ZXNbcm93LnNhdmVJbmRleF07XG5cblx0XHR0cmlnZ2VyRG93bmxvYWQoc2F2ZS5kYXRhLCBzYXZlLmZpbGVuYW1lKTtcblx0fVxufSk7XG5cbmxvZ0VsZW1lbnRzLmNsZWFyQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJTYXZlZEF1ZGlvID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0Ly8gQ2xlYXIgdGhlIHNhdmUgZGF0YVxuXHRhdWRpby5zYXZlcyA9IFtdO1xuXG5cdC8vIFJlc2V0IHRoZSBsb2cgdGFibGVcblx0QXJyYXkuZnJvbShsb2dFbGVtZW50cy50YWJsZUJvZHkucXVlcnlTZWxlY3RvckFsbCgndHI6bm90KCNsb2dfX25vLWF1ZGlvKScpKS5tYXAocmVtb3ZlRWxlbWVudCk7XG5cblx0bG9nRWxlbWVudHMudGFibGVOb0F1ZGlvLnN0eWxlID0gJyc7XG59KTsiLCJ2YXIgdmlzdWFsaXNlciA9IHtcblx0YW5hbHlzZXI6IHVuZGVmaW5lZCxcblx0Y2FudmFzOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndmlzdWFsaXNlcicpLFxuXHRjYW52YXNDb250ZXh0OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndmlzdWFsaXNlcicpLmdldENvbnRleHQoJzJkJyksXG59O1xuXG4vLyBNb3N0IG9mIHRoaXMgZmlsZSB3YXMgcmlwcGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21kbi93ZWItZGljdGFwaG9uZS9ibG9iL2doLXBhZ2VzL3NjcmlwdHMvYXBwLmpzI0wxMTdcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2F1ZGlvLnJlY29yZGluZycsIGZ1bmN0aW9uKCkge1xuXHQvLyBDcmVhdGUgdGhlIGFuYWx5c2VyXG5cdHZpc3VhbGlzZXIuYW5hbHlzZXIgPSBhdWRpby5jb250ZXh0LmNyZWF0ZUFuYWx5c2VyKGF1ZGlvLnN0cmVhbSk7XG5cdHZpc3VhbGlzZXIuYW5hbHlzZXIuZmZ0U2l6ZSA9IDIwNDg7XG5cblx0Ly8gQ3JlYXRlIHRoZSB3YXZlZm9ybSBkYXRhIGJ1ZmZlclxuXHR2aXN1YWxpc2VyLmJ1ZmZlckxlbmd0aCA9IHZpc3VhbGlzZXIuYW5hbHlzZXIuZnJlcXVlbmN5QmluQ291bnQ7XG5cdHZpc3VhbGlzZXIuZGF0YSA9IG5ldyBVaW50OEFycmF5KHZpc3VhbGlzZXIuYnVmZmVyTGVuZ3RoKTtcblxuXHRhdWRpby5zdHJlYW0uY29ubmVjdCh2aXN1YWxpc2VyLmFuYWx5c2VyKTtcblxuXHQvLyBTdGFydCBkcmF3aW5nXG5cdGRyYXdWaXN1YWxpc2VyKCk7XG59KTtcblxuZHJhd1Zpc3VhbGlzZXIgPSBmdW5jdGlvbigpIHtcblx0Ly8gUXVldWUgdGhlIG5leHQgZnJhbWVcblx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKGRyYXdWaXN1YWxpc2VyKTtcblxuXHQvLyBGZXRjaCB0aGUgd2F2ZWZvcm0gZGF0YVxuXHR2aXN1YWxpc2VyLmFuYWx5c2VyLmdldEJ5dGVUaW1lRG9tYWluRGF0YSh2aXN1YWxpc2VyLmRhdGEpO1xuXG5cdC8vIFJlc2V0IHRoZSBjYW52YXNcblx0dmlzdWFsaXNlci5jYW52YXMud2lkdGggPSB2aXN1YWxpc2VyLmNhbnZhcy5vZmZzZXRXaWR0aDtcblxuXHR2YXIgd2lkdGggPSB2aXN1YWxpc2VyLmNhbnZhcy53aWR0aDtcblx0dmFyIGhlaWdodCA9IHZpc3VhbGlzZXIuY2FudmFzLmhlaWdodDtcblxuXHR2aXN1YWxpc2VyLmNhbnZhc0NvbnRleHQuZmlsbFN0eWxlID0gJ3JnYigyMDAsIDIwMCwgMjAwKSc7XG5cdHZpc3VhbGlzZXIuY2FudmFzQ29udGV4dC5maWxsUmVjdCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcblxuXHR2aXN1YWxpc2VyLmNhbnZhc0NvbnRleHQubGluZVdpZHRoID0gMjtcblx0dmlzdWFsaXNlci5jYW52YXNDb250ZXh0LnN0cm9rZVN0eWxlID0gJ3JnYigwLCAwLCAwKSc7XG5cblx0Ly8gQmVnaW4gZHJhd2luZyB0aGUgd2F2ZWZvcm1cblx0dmlzdWFsaXNlci5jYW52YXNDb250ZXh0LmJlZ2luUGF0aCgpO1xuXHR2aXN1YWxpc2VyLmNhbnZhc0NvbnRleHQubW92ZVRvKDAsIGhlaWdodCAvIDIpO1xuXG5cdHZhciBzbGljZVdpZHRoID0gd2lkdGggKiAoMS4wIC8gdmlzdWFsaXNlci5idWZmZXJMZW5ndGgpO1xuXG5cdGZvcih2YXIgaSA9IDAsIHggPSAwOyBpIDwgdmlzdWFsaXNlci5idWZmZXJMZW5ndGg7IGkrKywgeCArPSBzbGljZVdpZHRoKSB7XG5cdFx0dmFyIHYgPSB2aXN1YWxpc2VyLmRhdGFbaV0gLyAxMjguMDtcblx0XHR2YXIgeSA9IHYgKiAoaGVpZ2h0IC8gMik7XG5cblx0XHR2aXN1YWxpc2VyLmNhbnZhc0NvbnRleHQubGluZVRvKHgsIHkpO1xuXHR9XG5cblx0dmlzdWFsaXNlci5jYW52YXNDb250ZXh0LmxpbmVUbyh3aWR0aCwgaGVpZ2h0IC8gMik7XG5cdHZpc3VhbGlzZXIuY2FudmFzQ29udGV4dC5zdHJva2UoKTtcbn07Il19
