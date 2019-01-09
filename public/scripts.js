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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImF1ZGlvLmpzIiwiY29tbW9uLmpzIiwiY29udHJvbHMuanMiLCJsb2cuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDNUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJzY3JpcHRzLmpzIiwic291cmNlc0NvbnRlbnQiOlsidmFyIGF1ZGlvID0ge1xuXHRjb250ZXh0OiBuZXcgQXVkaW9Db250ZXh0KHsgc2FtcGxlUmF0ZTogNDQxMDAgfSksXG5cdHN0cmVhbTogdW5kZWZpbmVkLCAvLyBUaGUgY3VycmVudCBzdHJlYW0gdGhhdCdzIGJlaW5nIHJlY29yZGVkXG5cdGJ1ZmZlckxlbmd0aDogMCwgLy8gTnVtYmVyIG9mIHNhbXBsZXNcblx0Y2h1bmtEdXJhdGlvbjogW10sIC8vIER1cmF0aW9uIGluIHNlY29uZHMgZm9yIGVhY2ggY2h1bmtcblx0Y2h1bmtzOiBbXSwgLy8gQXJyYXkgb2YgY2hhbm5lbCA9PiBzYW1wbGUgY2h1bmtzXG5cdHNhdmVzOiBbXSxcbn07XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjb250cm9scy5zb3VyY2UuY2hhbmdlJywgc3RhcnRSZWNvcmRpbmdBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHQvLyBPcGVuIHRoZSBjaG9zZW4gc291cmNlIGF0IDQ0LjFrIHNhbXBsZSByYXRlLCAzMi1iaXRcblx0dmFyIGNvbnN0cmFpbnRzID0ge1xuXHRcdGF1ZGlvOiB7XG5cdFx0XHRkZXZpY2VJZDogY29udHJvbHMuc291cmNlLFxuXHRcdFx0c2FtcGxlUmF0ZTogNDQxMDAsXG5cdFx0XHRzYW1wbGVTaXplOiAzMixcblx0XHRcdGNoYW5uZWxDb3VudDogY29udHJvbHMuY2hhbm5lbHMsXG5cdFx0fSxcblx0XHR2aWRlbzogZmFsc2UsXG5cdH07XG5cblx0bmF2aWdhdG9yLm1lZGlhRGV2aWNlcy5nZXRVc2VyTWVkaWEoY29uc3RyYWludHMpXG5cdFx0LnRoZW4oZnVuY3Rpb24oc3RyZWFtKSB7XG5cdFx0XHQvLyBTdG9wIGFueSBvbGQgc3RyZWFtc1xuXHRcdFx0aWYoYXVkaW8uc3RyZWFtKSB7XG5cdFx0XHRcdGF1ZGlvLnN0cmVhbS5kaXNjb25uZWN0KCk7XG5cblx0XHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdhdWRpby5zdG9wcGVkJykpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNldCBldmVyeXRoaW5nXG5cdFx0XHRhdWRpby5zdHJlYW0gPSBhdWRpby5jb250ZXh0LmNyZWF0ZU1lZGlhU3RyZWFtU291cmNlKHN0cmVhbSk7XG5cdFx0XHRhdWRpby5idWZmZXJMZW5ndGggPSAwO1xuXHRcdFx0YXVkaW8uY2h1bmtEdXJhdGlvbiA9IFtdO1xuXHRcdFx0YXVkaW8uY2h1bmtzID0gW107XG5cblx0XHRcdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0XHRcdGF1ZGlvLmNodW5rc1tjaGFubmVsXSA9IFtdO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdGFydCByZWNvcmRpbmdcblx0XHRcdHZhciBzY3JpcHRQcm9jZXNzb3JOb2RlID0gYXVkaW8uY29udGV4dC5jcmVhdGVTY3JpcHRQcm9jZXNzb3IoNDA5NiwgY29udHJvbHMuY2hhbm5lbHMsIGNvbnRyb2xzLmNoYW5uZWxzKTtcblx0XHRcdHNjcmlwdFByb2Nlc3Nvck5vZGUuYWRkRXZlbnRMaXN0ZW5lcignYXVkaW9wcm9jZXNzJywgcmVjb3JkQXVkaW8pO1xuXG5cdFx0XHRhdWRpby5zdHJlYW0uY29ubmVjdChzY3JpcHRQcm9jZXNzb3JOb2RlKTtcblxuXHRcdFx0Ly8gTm90aWZ5IHN0dWZmIHRoYXQgcmVjb3JkaW5nJ3MgYmVndW5cblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYXVkaW8ucmVjb3JkaW5nJykpO1xuXHRcdH0pXG5cdFx0LmNhdGNoKGZ1bmN0aW9uKGVycm9yKSB7XG5cdFx0XHRhbGVydCgnVW5hYmxlIHRvIG9wZW4gYXVkaW8gc3RyZWFtJyk7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gb3BlbiBhdWRpbyBzdHJlYW0nLCBlcnJvcik7XG5cdFx0fSlcbn0pO1xuXG5yZWNvcmRBdWRpbyA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdC8vIFNhdmUgdGhlIGF1ZGlvIGRhdGFcblx0Zm9yKHZhciBjaGFubmVsID0gMDsgY2hhbm5lbCA8IGNvbnRyb2xzLmNoYW5uZWxzOyBjaGFubmVsKyspIHtcblx0XHRhdWRpby5jaHVua3NbY2hhbm5lbF0ucHVzaChldmVudC5pbnB1dEJ1ZmZlci5nZXRDaGFubmVsRGF0YShjaGFubmVsKSk7XG5cdH1cblxuXHQvLyBJbmNyZW1lbnQgdGhlIGJ1ZmZlcidzIGxlbmd0aCAoaW4gc2FtcGxlcykgYW5kIGR1cmF0aW9uIChpbiBzZWNvbmRzKVxuXHRhdWRpby5idWZmZXJMZW5ndGggKz0gZXZlbnQuaW5wdXRCdWZmZXIubGVuZ3RoO1xuXHRhdWRpby5jaHVua0R1cmF0aW9uLnB1c2goZXZlbnQuaW5wdXRCdWZmZXIuZHVyYXRpb24pO1xuXG5cdC8vIFRyaW0gYXVkaW8gdGhhdCdzIHRvbyBvbGRcblx0dmFyIHN1bUJ1ZmZlckR1cmF0aW9uID0gc3VtT2ZBcnJheShhdWRpby5jaHVua0R1cmF0aW9uKTtcblx0d2hpbGUoc3VtQnVmZmVyRHVyYXRpb24gPiBjb250cm9scy5kdXJhdGlvbikge1xuXHRcdC8vIFJlbW92ZSB0aGUgb2xkZXN0IGJpdHNcblx0XHRzdW1CdWZmZXJEdXJhdGlvbiAtPSBhdWRpby5jaHVua0R1cmF0aW9uLnNoaWZ0KCk7XG5cdFx0YXVkaW8uYnVmZmVyTGVuZ3RoIC09IGF1ZGlvLmNodW5rc1swXS5zaGlmdCgpLmxlbmd0aDtcblxuXHRcdC8vIGNoYW5uZWwgPSAxIGJlY2F1c2UgMCBoYXMgYWxyZWFkeSBiZWVuIC5zaGlmdCgpJ2Rcblx0XHRmb3IodmFyIGNoYW5uZWwgPSAxOyBjaGFubmVsIDwgY29udHJvbHMuY2hhbm5lbHM7IGNoYW5uZWwrKykge1xuXHRcdFx0YXVkaW8uY2h1bmtzW2NoYW5uZWxdLnNoaWZ0KCk7XG5cdFx0fVxuXHR9XG59XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjb250cm9scy5zYXZlJywgc2F2ZUF1ZGlvID0gZnVuY3Rpb24oKSB7XG5cdC8vIEdlbmVyYXRlIHRoZSBhdWRpbyBmaWxlXG5cdC8vIDEuIE1lcmdlIGVhY2ggY2hhbm5lbCdzIGRhdGEgaW50byBhIHNpbmdsZSBidWZmZXIgcmVzcGVjdGl2ZWx5XG5cdHZhciBtZXJnZWQgPSBbXTtcblx0Zm9yKHZhciBjaGFubmVsID0gMDsgY2hhbm5lbCA8IGNvbnRyb2xzLmNoYW5uZWxzOyBjaGFubmVsKyspIHtcblx0XHRtZXJnZWRbY2hhbm5lbF0gPSBuZXcgRmxvYXQzMkFycmF5KGF1ZGlvLmJ1ZmZlckxlbmd0aCk7XG5cblx0XHRmb3IodmFyIGkgPSAwLCBvZmZzZXQgPSAwOyBpIDwgYXVkaW8uY2h1bmtzW2NoYW5uZWxdLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRtZXJnZWRbY2hhbm5lbF0uc2V0KGF1ZGlvLmNodW5rc1tjaGFubmVsXVtpXSwgb2Zmc2V0KTtcblx0XHRcdG9mZnNldCArPSBhdWRpby5jaHVua3NbY2hhbm5lbF1baV0ubGVuZ3RoO1xuXHRcdH1cblx0fVxuXG5cdC8vIDIuIEludGVybGVhdmUgdGhlIGNoYW5uZWwgYnVmZmVycyBpbnRvIGEgc2luZ2xlIGJ1ZmZlclxuXHR2YXIgaW50ZXJsZWF2ZWQgPSBuZXcgRmxvYXQzMkFycmF5KGF1ZGlvLmJ1ZmZlckxlbmd0aCAqIGNvbnRyb2xzLmNoYW5uZWxzKTtcblx0Zm9yKHZhciBpID0gMCwgaiA9IDA7IGkgPCBpbnRlcmxlYXZlZC5sZW5ndGg7IGorKykge1xuXHRcdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0XHRpbnRlcmxlYXZlZFtpKytdID0gbWVyZ2VkW2NoYW5uZWxdW2pdO1xuXHRcdH1cblx0fVxuXG5cdHZhciB3YXZEYXRhID0gZW5jb2RlV0FWKGludGVybGVhdmVkLCA0NDEwMCwgY29udHJvbHMuY2hhbm5lbHMpO1xuXG5cdHZhciBibG9iID0gbmV3IEJsb2IoW3dhdkRhdGFdLCB7XG5cdFx0dHlwZTogJ2F1ZGlvL3dhdicsXG5cdH0pO1xuXG5cdC8vIEdlbmVyYXRlIGEgZmlsZW5hbWVcblx0dmFyIGZpbGVuYW1lID0gKG5ldyBEYXRlKCkpLnRvSVNPU3RyaW5nKCk7XG5cdGZpbGVuYW1lID0gZmlsZW5hbWUucmVwbGFjZSgnVCcsICdfJyk7XG5cdGZpbGVuYW1lID0gZmlsZW5hbWUuc3BsaXQoJy4nKVswXTtcblx0ZmlsZW5hbWUgPSBmaWxlbmFtZS5yZXBsYWNlKC86L2csICctJyk7XG5cdGZpbGVuYW1lID0gZmlsZW5hbWUrJy53YXYnO1xuXG5cdC8vIERvd25sb2FkIGl0IGFuZCBzYXZlXG5cdHRyaWdnZXJEb3dubG9hZChibG9iLCBmaWxlbmFtZSk7XG5cdGF1ZGlvLnNhdmVzLnB1c2goe1xuXHRcdGRhdGE6IGJsb2IsXG5cdFx0ZmlsZW5hbWU6IGZpbGVuYW1lLFxuXHRcdHRpbWVzdGFtcDogbmV3IERhdGUoKSxcblx0fSk7XG5cblx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdhdWRpby5zYXZlZCcpKTtcbn0pOyIsImZ1bmN0aW9uIHJlbW92ZUFsbENoaWxkcmVuKGVsZW1lbnQpIHtcblx0d2hpbGUoZWxlbWVudC5maXJzdENoaWxkKSB7XG5cdFx0ZWxlbWVudC5yZW1vdmVDaGlsZChlbGVtZW50LmZpcnN0Q2hpbGQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUVsZW1lbnQoZWxlbWVudCkge1xuXHRlbGVtZW50LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWxlbWVudCk7XG59XG5cbmZ1bmN0aW9uIHN1bU9mQXJyYXkoYXJyYXkpIHtcblx0cmV0dXJuIGFycmF5LnJlZHVjZShmdW5jdGlvbihzdW0sIHZhbHVlKSB7XG5cdFx0cmV0dXJuIHN1bSArIHZhbHVlO1xuXHR9LCAwKTtcbn1cblxuZnVuY3Rpb24gdHJpZ2dlckRvd25sb2FkKGJsb2IsIGZpbGVuYW1lKSB7XG5cdHZhciBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuXHRhLnRhcmdldCA9ICdfYmxhbmsnO1xuXHRhLmhyZWYgPSB3aW5kb3cuVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcblx0YS5kb3dubG9hZCA9IGZpbGVuYW1lO1xuXG5cdGEuc3R5bGUgPSAnZGlzcGxheTpub25lJztcblx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTtcblxuXHRhLmNsaWNrKCk7XG5cblx0d2luZG93LlVSTC5yZXZva2VPYmplY3RVUkwoYS5ocmVmKTtcblx0ZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChhKTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlV0FWKHNhbXBsZXMsIHNhbXBsZVJhdGUsIG51bUNoYW5uZWxzKSB7XG5cdC8vIFJpcHBlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXR0ZGlhbW9uZC9SZWNvcmRlcmpzL2Jsb2IvbWFzdGVyL2xpYi9yZWNvcmRlci5qcyNMMTcwXG5cdHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoNDQgKyBzYW1wbGVzLmxlbmd0aCAqIDIpO1xuXHR2YXIgdmlldyA9IG5ldyBEYXRhVmlldyhidWZmZXIpO1xuXG5cdC8qIFJJRkYgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAwLCAnUklGRicpO1xuXHQvKiBSSUZGIGNodW5rIGxlbmd0aCAqL1xuXHR2aWV3LnNldFVpbnQzMig0LCAzNiArIHNhbXBsZXMubGVuZ3RoICogMiwgdHJ1ZSk7XG5cdC8qIFJJRkYgdHlwZSAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCA4LCAnV0FWRScpO1xuXHQvKiBmb3JtYXQgY2h1bmsgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAxMiwgJ2ZtdCAnKTtcblx0LyogZm9ybWF0IGNodW5rIGxlbmd0aCAqL1xuXHR2aWV3LnNldFVpbnQzMigxNiwgMTYsIHRydWUpO1xuXHQvKiBzYW1wbGUgZm9ybWF0IChyYXcpICovXG5cdHZpZXcuc2V0VWludDE2KDIwLCAxLCB0cnVlKTtcblx0LyogY2hhbm5lbCBjb3VudCAqL1xuXHR2aWV3LnNldFVpbnQxNigyMiwgbnVtQ2hhbm5lbHMsIHRydWUpO1xuXHQvKiBzYW1wbGUgcmF0ZSAqL1xuXHR2aWV3LnNldFVpbnQzMigyNCwgc2FtcGxlUmF0ZSwgdHJ1ZSk7XG5cdC8qIGJ5dGUgcmF0ZSAoc2FtcGxlIHJhdGUgKiBibG9jayBhbGlnbikgKi9cblx0dmlldy5zZXRVaW50MzIoMjgsIHNhbXBsZVJhdGUgKiA0LCB0cnVlKTtcblx0LyogYmxvY2sgYWxpZ24gKGNoYW5uZWwgY291bnQgKiBieXRlcyBwZXIgc2FtcGxlKSAqL1xuXHR2aWV3LnNldFVpbnQxNigzMiwgbnVtQ2hhbm5lbHMgKiAyLCB0cnVlKTtcblx0LyogYml0cyBwZXIgc2FtcGxlICovXG5cdHZpZXcuc2V0VWludDE2KDM0LCAxNiwgdHJ1ZSk7XG5cdC8qIGRhdGEgY2h1bmsgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAzNiwgJ2RhdGEnKTtcblx0LyogZGF0YSBjaHVuayBsZW5ndGggKi9cblx0dmlldy5zZXRVaW50MzIoNDAsIHNhbXBsZXMubGVuZ3RoICogMiwgdHJ1ZSk7XG5cblx0ZmxvYXRUbzE2Qml0UENNKHZpZXcsIDQ0LCBzYW1wbGVzKTtcblxuXHRyZXR1cm4gdmlldztcbn1cblxuZnVuY3Rpb24gZmxvYXRUbzE2Qml0UENNKG91dHB1dCwgb2Zmc2V0LCBpbnB1dCkge1xuXHQvLyBSaXBwZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbWF0dGRpYW1vbmQvUmVjb3JkZXJqcy9ibG9iL21hc3Rlci9saWIvcmVjb3JkZXIuanMjTDE1N1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrLCBvZmZzZXQgKz0gMikge1xuXHRcdHZhciBzID0gTWF0aC5tYXgoLTEsIE1hdGgubWluKDEsIGlucHV0W2ldKSk7XG5cdFx0b3V0cHV0LnNldEludDE2KG9mZnNldCwgcyA8IDAgPyBzICogMHg4MDAwIDogcyAqIDB4N0ZGRiwgdHJ1ZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gd3JpdGVTdHJpbmcodmlldywgb2Zmc2V0LCBzdHJpbmcpIHtcblx0Ly8gUmlwcGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21hdHRkaWFtb25kL1JlY29yZGVyanMvYmxvYi9tYXN0ZXIvbGliL3JlY29yZGVyLmpzI0wxNjRcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBzdHJpbmcubGVuZ3RoOyBpKyspIHtcblx0XHR2aWV3LnNldFVpbnQ4KG9mZnNldCArIGksIHN0cmluZy5jaGFyQ29kZUF0KGkpKTtcblx0fVxufSIsInZhciBjb250cm9scyA9IHtcblx0c291cmNlOiB1bmRlZmluZWQsXG5cdGR1cmF0aW9uOiB1bmRlZmluZWQsXG5cdGNoYW5uZWxzOiB1bmRlZmluZWQsXG59O1xuXG52YXIgY29udHJvbEVsZW1lbnRzID0ge1xuXHRzb3VyY2U6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1zb3VyY2UnKSxcblx0ZHVyYXRpb246IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1kdXJhdGlvbicpLFxuXHRjaGFubmVsczogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F1ZGlvLWNoYW5uZWxzJyksXG5cdHNhdmU6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1zYXZlJyksXG59XG5cbnBvcHVsYXRlQXVkaW9Tb3VyY2VzID0gZnVuY3Rpb24oKSB7XG5cdG5hdmlnYXRvci5tZWRpYURldmljZXMuZW51bWVyYXRlRGV2aWNlcygpXG5cdFx0LnRoZW4oZnVuY3Rpb24oZGV2aWNlcykge1xuXHRcdFx0Ly8gRmlsdGVyIHRvIHZhbGlkIGRldmljZXNcblx0XHRcdHZhciBhdWRpb0RldmljZXMgPSBkZXZpY2VzLmZpbHRlcihmdW5jdGlvbihkZXZpY2UpIHtcblx0XHRcdFx0cmV0dXJuIGRldmljZS5raW5kID09ICdhdWRpb2lucHV0Jztcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBSZS1wb3B1bGF0ZSB0aGUgc291cmNlIHNlbGVjdG9yIG9wdGlvbnNcblx0XHRcdHJlbW92ZUFsbENoaWxkcmVuKGNvbnRyb2xFbGVtZW50cy5zb3VyY2UpO1xuXG5cdFx0XHRhdWRpb0RldmljZXMuZm9yRWFjaChmdW5jdGlvbihkZXZpY2UpIHtcblx0XHRcdFx0Ly8gQ3JlYXRlIGFuIDxvcHRpb24+XG5cdFx0XHRcdHZhciBkZXZpY2VPcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcblx0XHRcdFx0ZGV2aWNlT3B0aW9uLnZhbHVlID0gZGV2aWNlLmRldmljZUlkO1xuXHRcdFx0XHRkZXZpY2VPcHRpb24udGV4dENvbnRlbnQgPSAoZGV2aWNlLmxhYmVsID8gZGV2aWNlLmxhYmVsIDogZGV2aWNlLmRldmljZUlkKTtcblxuXHRcdFx0XHRjb250cm9sRWxlbWVudHMuc291cmNlLmFwcGVuZENoaWxkKGRldmljZU9wdGlvbik7XG5cblx0XHRcdFx0aWYoZGV2aWNlLmRldmljZUlkID09IGNvbnRyb2xzLnNvdXJjZSkge1xuXHRcdFx0XHRcdC8vIFRoaXMgaXMgdGhlIGFjdGl2ZSBzb3VyY2Ugc28gbWFrZSBzdXJlIHRoZSBzZWxlY3RvciBtYXRjaGVzXG5cdFx0XHRcdFx0Y29udHJvbEVsZW1lbnRzLnNvdXJjZS52YWx1ZSA9IGRldmljZU9wdGlvbi52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgYSBjaGFuZ2UgZXZlbnQgc28gdGhlIGFjdGl2ZSBzb3VyY2UgbWF0Y2hlcyB0aGUgc2VsZWN0b3Jcblx0XHRcdGNvbnRyb2xFbGVtZW50cy5zb3VyY2UuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblx0XHR9KVxuXHRcdC5jYXRjaChmdW5jdGlvbihlcnJvcikge1xuXHRcdFx0YWxlcnQoJ1VuYWJsZSB0byBmZXRjaCBhdWRpbyBkZXZpY2VzJyk7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdVbmFibGVkIHRvIGZldGNoIGF1ZGlvIGRldmljZXMnLCBlcnJvcik7XG5cdFx0fSlcbn0oKTtcblxuY29udHJvbEVsZW1lbnRzLnNvdXJjZS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBjaGFuZ2VBdWRpb1NvdXJjZSA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdHZhciBjaG9zZW5Tb3VyY2UgPSBjb250cm9sRWxlbWVudHMuc291cmNlLnZhbHVlO1xuXG5cdGlmKGNob3NlblNvdXJjZSAhPSBjb250cm9scy5zb3VyY2UpIHtcblx0XHQvLyBEaWZmZXJlbnQgc291cmNlIGhhcyBiZWVuIGNob3NlbiwgdHJpZ2dlciB1cGRhdGVzXG5cdFx0Y29udHJvbHMuc291cmNlID0gY2hvc2VuU291cmNlO1xuXG5cdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjb250cm9scy5zb3VyY2UuY2hhbmdlJykpO1xuXHR9XG59KTtcblxudmFyIF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5jaGFuZ2VBdWRpb0R1cmF0aW9uID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0Ly8gX2R1cmF0aW9uQ2hhbmdlVGltZW91dCBpcyBhIGdsb2JhbCB0aGF0J3MgZWZmZWN0aXZlbHkgZGVib3VuY2luZyB0aGlzIGZ1bmN0aW9uXG5cdGlmKF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNsZWFyVGltZW91dChfZHVyYXRpb25DaGFuZ2VUaW1lb3V0KTtcblx0fVxuXG5cdF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cblx0XHR2YXIgY2hvc2VuRHVyYXRpb24gPSBjb250cm9sRWxlbWVudHMuZHVyYXRpb24udmFsdWU7XG5cblx0XHRpZihjaG9zZW5EdXJhdGlvbiAhPSBjb250cm9scy5kdXJhdGlvbikge1xuXHRcdFx0Ly8gRGlmZmVyZW50IGR1cmF0aW9uIGhhcyBiZWVuIGVudGVyZWQsIHRyaWdnZXIgdXBkYXRlc1xuXHRcdFx0Y29udHJvbHMuZHVyYXRpb24gPSBjaG9zZW5EdXJhdGlvbjtcblxuXHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjb250cm9scy5kdXJhdGlvbi5jaGFuZ2UnKSk7XG5cdFx0fVxuXHR9LCA1MDApO1xufSgpO1xuY29udHJvbEVsZW1lbnRzLmR1cmF0aW9uLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgY2hhbmdlQXVkaW9EdXJhdGlvbik7XG5cbnZhciBfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuY2hhbmdlQXVkaW9EdXJhdGlvbiA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdC8vIF9jaGFubmVsc0NoYW5nZVRpbWVvdXQgaXMgYSBnbG9iYWwgdGhhdCdzIGVmZmVjdGl2ZWx5IGRlYm91bmNpbmcgdGhpcyBmdW5jdGlvblxuXHRpZihfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRjbGVhclRpbWVvdXQoX2NoYW5uZWxzQ2hhbmdlVGltZW91dCk7XG5cdH1cblxuXHRfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXG5cdFx0dmFyIGNob3NlbkNoYW5uZWxzID0gY29udHJvbEVsZW1lbnRzLmNoYW5uZWxzLnZhbHVlO1xuXG5cdFx0aWYoY2hvc2VuQ2hhbm5lbHMgIT0gY29udHJvbHMuY2hhbm5lbHMpIHtcblx0XHRcdC8vIERpZmZlcmVudCBjaGFubmVscyBoYXMgYmVlbiBlbnRlcmVkLCB0cmlnZ2VyIHVwZGF0ZXNcblx0XHRcdGNvbnRyb2xzLmNoYW5uZWxzID0gY2hvc2VuQ2hhbm5lbHM7XG5cblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29udHJvbHMuY2hhbm5lbHMuY2hhbmdlJykpO1xuXHRcdH1cblx0fSwgNTAwKTtcbn0oKTtcbmNvbnRyb2xFbGVtZW50cy5jaGFubmVscy5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGNoYW5nZUF1ZGlvRHVyYXRpb24pO1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYXVkaW8ucmVjb3JkaW5nJywgZW5hYmxlU2F2ZUF1ZGlvID0gZnVuY3Rpb24oKSB7XG5cdGNvbnRyb2xFbGVtZW50cy5zYXZlLmRpc2FibGVkID0gZmFsc2U7XG59KTtcblxuY29udHJvbEVsZW1lbnRzLnNhdmUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGlja1NhdmVBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbnRyb2xzLnNhdmUnKSk7XG59KTsiLCJ2YXIgbG9nRWxlbWVudHMgPSB7XG5cdHRhYmxlQm9keTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ19fYm9keScpLFxuXHR0YWJsZU5vQXVkaW86IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dfX25vLWF1ZGlvJyksXG5cdGNsZWFyQnV0dG9uOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nX19jbGVhcicpLFxufTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2F1ZGlvLnNhdmVkJywgdXBkYXRlTG9nVGFibGUgPSBmdW5jdGlvbigpIHtcblx0aWYoIWF1ZGlvLnNhdmVzLmxlbmd0aCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIFJlbW92ZSB0aGUgXCJubyBzYXZlc1wiIG5vdGljZVxuXHRsb2dFbGVtZW50cy50YWJsZU5vQXVkaW8uc3R5bGUgPSAnZGlzcGxheTpub25lJztcblxuXHQvLyBBZGQgdGhlIGxhdGVzdCBzYXZlXG5cdHZhciBsYXRlc3RTYXZlSW5kZXggPSBhdWRpby5zYXZlcy5sZW5ndGggLSAxO1xuXHR2YXIgbGF0ZXN0U2F2ZSA9IGF1ZGlvLnNhdmVzW2xhdGVzdFNhdmVJbmRleF07XG5cblx0dmFyIHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7XG5cdHJvdy5zYXZlSW5kZXggPSBsYXRlc3RTYXZlSW5kZXg7XG5cdHJvdy5pbm5lckhUTUwgPSBgXG5cdFx0PHRkIGNsYXNzPVwidGV4dC1ub3dyYXAgcHItMlwiPlxuXHRcdFx0JHtsYXRlc3RTYXZlLnRpbWVzdGFtcC50b0xvY2FsZVN0cmluZygpfVxuXHRcdDwvdGQ+XG5cdFx0PHRkIGNsYXNzPVwidGV4dC1ub3dyYXBcIj5cblx0XHRcdCR7bGF0ZXN0U2F2ZS5maWxlbmFtZX1cblx0XHQ8L3RkPlxuXHRcdDx0ZCBjbGFzcz1cInRleHQtbm93cmFwIHBsLTJcIj5cblx0XHRcdDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGRhdGEtYWN0aW9uPVwiZG93bmxvYWRcIiBjbGFzcz1cImJ0biBidG4tc3VjY2VzcyBidG4tc21cIj5Eb3dubG9hZDwvYnV0dG9uPlxuXHRcdDwvdGQ+XG5cdGA7XG5cblx0bG9nRWxlbWVudHMudGFibGVCb2R5LmFwcGVuZENoaWxkKHJvdyk7XG59KTtcblxubG9nRWxlbWVudHMudGFibGVCb2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZG93bmxvYWRTYXZlZEF1ZGlvID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0aWYoZXZlbnQudGFyZ2V0ICYmIGV2ZW50LnRhcmdldC5tYXRjaGVzKCdbZGF0YS1hY3Rpb249XCJkb3dubG9hZFwiXScpKSB7XG5cdFx0Ly8gRmluZCB0aGUgc2F2ZSBhbmQgZG93bmxvYWQgaXRcblx0XHR2YXIgcm93ID0gZXZlbnQudGFyZ2V0LmNsb3Nlc3QoJ3RyJyk7XG5cdFx0dmFyIHNhdmUgPSBhdWRpby5zYXZlc1tyb3cuc2F2ZUluZGV4XTtcblxuXHRcdHRyaWdnZXJEb3dubG9hZChzYXZlLmRhdGEsIHNhdmUuZmlsZW5hbWUpO1xuXHR9XG59KTtcblxubG9nRWxlbWVudHMuY2xlYXJCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGVhclNhdmVkQXVkaW8gPSBmdW5jdGlvbihldmVudCkge1xuXHQvLyBDbGVhciB0aGUgc2F2ZSBkYXRhXG5cdGF1ZGlvLnNhdmVzID0gW107XG5cblx0Ly8gUmVzZXQgdGhlIGxvZyB0YWJsZVxuXHRBcnJheS5mcm9tKGxvZ0VsZW1lbnRzLnRhYmxlQm9keS5xdWVyeVNlbGVjdG9yQWxsKCd0cjpub3QoI2xvZ19fbm8tYXVkaW8pJykpLm1hcChyZW1vdmVFbGVtZW50KTtcblxuXHRsb2dFbGVtZW50cy50YWJsZU5vQXVkaW8uc3R5bGUgPSAnJztcbn0pOyJdfQ==
