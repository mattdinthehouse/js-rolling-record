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
	var filename = ''+(new Date()).getTime()+'.wav';

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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImF1ZGlvLmpzIiwiY29tbW9uLmpzIiwiY29udHJvbHMuanMiLCJsb2cuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3RIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzVHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoic2NyaXB0cy5qcyIsInNvdXJjZXNDb250ZW50IjpbInZhciBhdWRpbyA9IHtcblx0Y29udGV4dDogbmV3IEF1ZGlvQ29udGV4dCh7IHNhbXBsZVJhdGU6IDQ0MTAwIH0pLFxuXHRzdHJlYW06IHVuZGVmaW5lZCwgLy8gVGhlIGN1cnJlbnQgc3RyZWFtIHRoYXQncyBiZWluZyByZWNvcmRlZFxuXHRidWZmZXJMZW5ndGg6IDAsIC8vIE51bWJlciBvZiBzYW1wbGVzXG5cdGNodW5rRHVyYXRpb246IFtdLCAvLyBEdXJhdGlvbiBpbiBzZWNvbmRzIGZvciBlYWNoIGNodW5rXG5cdGNodW5rczogW10sIC8vIEFycmF5IG9mIGNoYW5uZWwgPT4gc2FtcGxlIGNodW5rc1xuXHRzYXZlczogW10sXG59O1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY29udHJvbHMuc291cmNlLmNoYW5nZScsIHN0YXJ0UmVjb3JkaW5nQXVkaW8gPSBmdW5jdGlvbigpIHtcblx0Ly8gT3BlbiB0aGUgY2hvc2VuIHNvdXJjZSBhdCA0NC4xayBzYW1wbGUgcmF0ZSwgMzItYml0XG5cdHZhciBjb25zdHJhaW50cyA9IHtcblx0XHRhdWRpbzoge1xuXHRcdFx0ZGV2aWNlSWQ6IGNvbnRyb2xzLnNvdXJjZSxcblx0XHRcdHNhbXBsZVJhdGU6IDQ0MTAwLFxuXHRcdFx0c2FtcGxlU2l6ZTogMzIsXG5cdFx0XHRjaGFubmVsQ291bnQ6IGNvbnRyb2xzLmNoYW5uZWxzLFxuXHRcdH0sXG5cdFx0dmlkZW86IGZhbHNlLFxuXHR9O1xuXG5cdG5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0VXNlck1lZGlhKGNvbnN0cmFpbnRzKVxuXHRcdC50aGVuKGZ1bmN0aW9uKHN0cmVhbSkge1xuXHRcdFx0Ly8gU3RvcCBhbnkgb2xkIHN0cmVhbXNcblx0XHRcdGlmKGF1ZGlvLnN0cmVhbSkge1xuXHRcdFx0XHRhdWRpby5zdHJlYW0uZGlzY29ubmVjdCgpO1xuXG5cdFx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYXVkaW8uc3RvcHBlZCcpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzZXQgZXZlcnl0aGluZ1xuXHRcdFx0YXVkaW8uc3RyZWFtID0gYXVkaW8uY29udGV4dC5jcmVhdGVNZWRpYVN0cmVhbVNvdXJjZShzdHJlYW0pO1xuXHRcdFx0YXVkaW8uYnVmZmVyTGVuZ3RoID0gMDtcblx0XHRcdGF1ZGlvLmNodW5rRHVyYXRpb24gPSBbXTtcblx0XHRcdGF1ZGlvLmNodW5rcyA9IFtdO1xuXG5cdFx0XHRmb3IodmFyIGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgY29udHJvbHMuY2hhbm5lbHM7IGNoYW5uZWwrKykge1xuXHRcdFx0XHRhdWRpby5jaHVua3NbY2hhbm5lbF0gPSBbXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3RhcnQgcmVjb3JkaW5nXG5cdFx0XHR2YXIgc2NyaXB0UHJvY2Vzc29yTm9kZSA9IGF1ZGlvLmNvbnRleHQuY3JlYXRlU2NyaXB0UHJvY2Vzc29yKDQwOTYsIGNvbnRyb2xzLmNoYW5uZWxzLCBjb250cm9scy5jaGFubmVscyk7XG5cdFx0XHRzY3JpcHRQcm9jZXNzb3JOb2RlLmFkZEV2ZW50TGlzdGVuZXIoJ2F1ZGlvcHJvY2VzcycsIHJlY29yZEF1ZGlvKTtcblxuXHRcdFx0YXVkaW8uc3RyZWFtLmNvbm5lY3Qoc2NyaXB0UHJvY2Vzc29yTm9kZSk7XG5cblx0XHRcdC8vIE5vdGlmeSBzdHVmZiB0aGF0IHJlY29yZGluZydzIGJlZ3VuXG5cdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2F1ZGlvLnJlY29yZGluZycpKTtcblx0XHR9KVxuXHRcdC5jYXRjaChmdW5jdGlvbihlcnJvcikge1xuXHRcdFx0YWxlcnQoJ1VuYWJsZSB0byBvcGVuIGF1ZGlvIHN0cmVhbScpO1xuXHRcdFx0Y29uc29sZS5lcnJvcignVW5hYmxlIHRvIG9wZW4gYXVkaW8gc3RyZWFtJywgZXJyb3IpO1xuXHRcdH0pXG59KTtcblxucmVjb3JkQXVkaW8gPSBmdW5jdGlvbihldmVudCkge1xuXHQvLyBTYXZlIHRoZSBhdWRpbyBkYXRhXG5cdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0YXVkaW8uY2h1bmtzW2NoYW5uZWxdLnB1c2goZXZlbnQuaW5wdXRCdWZmZXIuZ2V0Q2hhbm5lbERhdGEoY2hhbm5lbCkpO1xuXHR9XG5cblx0Ly8gSW5jcmVtZW50IHRoZSBidWZmZXIncyBsZW5ndGggKGluIHNhbXBsZXMpIGFuZCBkdXJhdGlvbiAoaW4gc2Vjb25kcylcblx0YXVkaW8uYnVmZmVyTGVuZ3RoICs9IGV2ZW50LmlucHV0QnVmZmVyLmxlbmd0aDtcblx0YXVkaW8uY2h1bmtEdXJhdGlvbi5wdXNoKGV2ZW50LmlucHV0QnVmZmVyLmR1cmF0aW9uKTtcblxuXHQvLyBUcmltIGF1ZGlvIHRoYXQncyB0b28gb2xkXG5cdHZhciBzdW1CdWZmZXJEdXJhdGlvbiA9IHN1bU9mQXJyYXkoYXVkaW8uY2h1bmtEdXJhdGlvbik7XG5cdHdoaWxlKHN1bUJ1ZmZlckR1cmF0aW9uID4gY29udHJvbHMuZHVyYXRpb24pIHtcblx0XHQvLyBSZW1vdmUgdGhlIG9sZGVzdCBiaXRzXG5cdFx0c3VtQnVmZmVyRHVyYXRpb24gLT0gYXVkaW8uY2h1bmtEdXJhdGlvbi5zaGlmdCgpO1xuXHRcdGF1ZGlvLmJ1ZmZlckxlbmd0aCAtPSBhdWRpby5jaHVua3NbMF0uc2hpZnQoKS5sZW5ndGg7XG5cblx0XHQvLyBjaGFubmVsID0gMSBiZWNhdXNlIDAgaGFzIGFscmVhZHkgYmVlbiAuc2hpZnQoKSdkXG5cdFx0Zm9yKHZhciBjaGFubmVsID0gMTsgY2hhbm5lbCA8IGNvbnRyb2xzLmNoYW5uZWxzOyBjaGFubmVsKyspIHtcblx0XHRcdGF1ZGlvLmNodW5rc1tjaGFubmVsXS5zaGlmdCgpO1xuXHRcdH1cblx0fVxufVxuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY29udHJvbHMuc2F2ZScsIHNhdmVBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHQvLyBHZW5lcmF0ZSB0aGUgYXVkaW8gZmlsZVxuXHQvLyAxLiBNZXJnZSBlYWNoIGNoYW5uZWwncyBkYXRhIGludG8gYSBzaW5nbGUgYnVmZmVyIHJlc3BlY3RpdmVseVxuXHR2YXIgbWVyZ2VkID0gW107XG5cdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0bWVyZ2VkW2NoYW5uZWxdID0gbmV3IEZsb2F0MzJBcnJheShhdWRpby5idWZmZXJMZW5ndGgpO1xuXG5cdFx0Zm9yKHZhciBpID0gMCwgb2Zmc2V0ID0gMDsgaSA8IGF1ZGlvLmNodW5rc1tjaGFubmVsXS5sZW5ndGg7IGkrKykge1xuXHRcdFx0bWVyZ2VkW2NoYW5uZWxdLnNldChhdWRpby5jaHVua3NbY2hhbm5lbF1baV0sIG9mZnNldCk7XG5cdFx0XHRvZmZzZXQgKz0gYXVkaW8uY2h1bmtzW2NoYW5uZWxdW2ldLmxlbmd0aDtcblx0XHR9XG5cdH1cblxuXHQvLyAyLiBJbnRlcmxlYXZlIHRoZSBjaGFubmVsIGJ1ZmZlcnMgaW50byBhIHNpbmdsZSBidWZmZXJcblx0dmFyIGludGVybGVhdmVkID0gbmV3IEZsb2F0MzJBcnJheShhdWRpby5idWZmZXJMZW5ndGggKiBjb250cm9scy5jaGFubmVscyk7XG5cdGZvcih2YXIgaSA9IDAsIGogPSAwOyBpIDwgaW50ZXJsZWF2ZWQubGVuZ3RoOyBqKyspIHtcblx0XHRmb3IodmFyIGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgY29udHJvbHMuY2hhbm5lbHM7IGNoYW5uZWwrKykge1xuXHRcdFx0aW50ZXJsZWF2ZWRbaSsrXSA9IG1lcmdlZFtjaGFubmVsXVtqXTtcblx0XHR9XG5cdH1cblxuXHR2YXIgd2F2RGF0YSA9IGVuY29kZVdBVihpbnRlcmxlYXZlZCwgNDQxMDAsIGNvbnRyb2xzLmNoYW5uZWxzKTtcblxuXHR2YXIgYmxvYiA9IG5ldyBCbG9iKFt3YXZEYXRhXSwge1xuXHRcdHR5cGU6ICdhdWRpby93YXYnLFxuXHR9KTtcblxuXHQvLyBHZW5lcmF0ZSBhIGZpbGVuYW1lXG5cdHZhciBmaWxlbmFtZSA9ICcnKyhuZXcgRGF0ZSgpKS5nZXRUaW1lKCkrJy53YXYnO1xuXG5cdC8vIERvd25sb2FkIGl0IGFuZCBzYXZlXG5cdHRyaWdnZXJEb3dubG9hZChibG9iLCBmaWxlbmFtZSk7XG5cdGF1ZGlvLnNhdmVzLnB1c2goe1xuXHRcdGRhdGE6IGJsb2IsXG5cdFx0ZmlsZW5hbWU6IGZpbGVuYW1lLFxuXHRcdHRpbWVzdGFtcDogbmV3IERhdGUoKSxcblx0fSk7XG5cblx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdhdWRpby5zYXZlZCcpKTtcbn0pOyIsImZ1bmN0aW9uIHJlbW92ZUFsbENoaWxkcmVuKGVsZW1lbnQpIHtcblx0d2hpbGUoZWxlbWVudC5maXJzdENoaWxkKSB7XG5cdFx0ZWxlbWVudC5yZW1vdmVDaGlsZChlbGVtZW50LmZpcnN0Q2hpbGQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUVsZW1lbnQoZWxlbWVudCkge1xuXHRlbGVtZW50LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZWxlbWVudCk7XG59XG5cbmZ1bmN0aW9uIHN1bU9mQXJyYXkoYXJyYXkpIHtcblx0cmV0dXJuIGFycmF5LnJlZHVjZShmdW5jdGlvbihzdW0sIHZhbHVlKSB7XG5cdFx0cmV0dXJuIHN1bSArIHZhbHVlO1xuXHR9LCAwKTtcbn1cblxuZnVuY3Rpb24gdHJpZ2dlckRvd25sb2FkKGJsb2IsIGZpbGVuYW1lKSB7XG5cdHZhciBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuXHRhLnRhcmdldCA9ICdfYmxhbmsnO1xuXHRhLmhyZWYgPSB3aW5kb3cuVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcblx0YS5kb3dubG9hZCA9IGZpbGVuYW1lO1xuXG5cdGEuc3R5bGUgPSAnZGlzcGxheTpub25lJztcblx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTtcblxuXHRhLmNsaWNrKCk7XG5cblx0d2luZG93LlVSTC5yZXZva2VPYmplY3RVUkwoYS5ocmVmKTtcblx0ZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChhKTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlV0FWKHNhbXBsZXMsIHNhbXBsZVJhdGUsIG51bUNoYW5uZWxzKSB7XG5cdC8vIFJpcHBlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXR0ZGlhbW9uZC9SZWNvcmRlcmpzL2Jsb2IvbWFzdGVyL2xpYi9yZWNvcmRlci5qcyNMMTcwXG5cdHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoNDQgKyBzYW1wbGVzLmxlbmd0aCAqIDIpO1xuXHR2YXIgdmlldyA9IG5ldyBEYXRhVmlldyhidWZmZXIpO1xuXG5cdC8qIFJJRkYgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAwLCAnUklGRicpO1xuXHQvKiBSSUZGIGNodW5rIGxlbmd0aCAqL1xuXHR2aWV3LnNldFVpbnQzMig0LCAzNiArIHNhbXBsZXMubGVuZ3RoICogMiwgdHJ1ZSk7XG5cdC8qIFJJRkYgdHlwZSAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCA4LCAnV0FWRScpO1xuXHQvKiBmb3JtYXQgY2h1bmsgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAxMiwgJ2ZtdCAnKTtcblx0LyogZm9ybWF0IGNodW5rIGxlbmd0aCAqL1xuXHR2aWV3LnNldFVpbnQzMigxNiwgMTYsIHRydWUpO1xuXHQvKiBzYW1wbGUgZm9ybWF0IChyYXcpICovXG5cdHZpZXcuc2V0VWludDE2KDIwLCAxLCB0cnVlKTtcblx0LyogY2hhbm5lbCBjb3VudCAqL1xuXHR2aWV3LnNldFVpbnQxNigyMiwgbnVtQ2hhbm5lbHMsIHRydWUpO1xuXHQvKiBzYW1wbGUgcmF0ZSAqL1xuXHR2aWV3LnNldFVpbnQzMigyNCwgc2FtcGxlUmF0ZSwgdHJ1ZSk7XG5cdC8qIGJ5dGUgcmF0ZSAoc2FtcGxlIHJhdGUgKiBibG9jayBhbGlnbikgKi9cblx0dmlldy5zZXRVaW50MzIoMjgsIHNhbXBsZVJhdGUgKiA0LCB0cnVlKTtcblx0LyogYmxvY2sgYWxpZ24gKGNoYW5uZWwgY291bnQgKiBieXRlcyBwZXIgc2FtcGxlKSAqL1xuXHR2aWV3LnNldFVpbnQxNigzMiwgbnVtQ2hhbm5lbHMgKiAyLCB0cnVlKTtcblx0LyogYml0cyBwZXIgc2FtcGxlICovXG5cdHZpZXcuc2V0VWludDE2KDM0LCAxNiwgdHJ1ZSk7XG5cdC8qIGRhdGEgY2h1bmsgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAzNiwgJ2RhdGEnKTtcblx0LyogZGF0YSBjaHVuayBsZW5ndGggKi9cblx0dmlldy5zZXRVaW50MzIoNDAsIHNhbXBsZXMubGVuZ3RoICogMiwgdHJ1ZSk7XG5cblx0ZmxvYXRUbzE2Qml0UENNKHZpZXcsIDQ0LCBzYW1wbGVzKTtcblxuXHRyZXR1cm4gdmlldztcbn1cblxuZnVuY3Rpb24gZmxvYXRUbzE2Qml0UENNKG91dHB1dCwgb2Zmc2V0LCBpbnB1dCkge1xuXHQvLyBSaXBwZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbWF0dGRpYW1vbmQvUmVjb3JkZXJqcy9ibG9iL21hc3Rlci9saWIvcmVjb3JkZXIuanMjTDE1N1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrLCBvZmZzZXQgKz0gMikge1xuXHRcdHZhciBzID0gTWF0aC5tYXgoLTEsIE1hdGgubWluKDEsIGlucHV0W2ldKSk7XG5cdFx0b3V0cHV0LnNldEludDE2KG9mZnNldCwgcyA8IDAgPyBzICogMHg4MDAwIDogcyAqIDB4N0ZGRiwgdHJ1ZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gd3JpdGVTdHJpbmcodmlldywgb2Zmc2V0LCBzdHJpbmcpIHtcblx0Ly8gUmlwcGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21hdHRkaWFtb25kL1JlY29yZGVyanMvYmxvYi9tYXN0ZXIvbGliL3JlY29yZGVyLmpzI0wxNjRcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBzdHJpbmcubGVuZ3RoOyBpKyspIHtcblx0XHR2aWV3LnNldFVpbnQ4KG9mZnNldCArIGksIHN0cmluZy5jaGFyQ29kZUF0KGkpKTtcblx0fVxufSIsInZhciBjb250cm9scyA9IHtcblx0c291cmNlOiB1bmRlZmluZWQsXG5cdGR1cmF0aW9uOiB1bmRlZmluZWQsXG5cdGNoYW5uZWxzOiB1bmRlZmluZWQsXG59O1xuXG52YXIgY29udHJvbEVsZW1lbnRzID0ge1xuXHRzb3VyY2U6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1zb3VyY2UnKSxcblx0ZHVyYXRpb246IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1kdXJhdGlvbicpLFxuXHRjaGFubmVsczogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F1ZGlvLWNoYW5uZWxzJyksXG5cdHNhdmU6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1zYXZlJyksXG59XG5cbnBvcHVsYXRlQXVkaW9Tb3VyY2VzID0gZnVuY3Rpb24oKSB7XG5cdG5hdmlnYXRvci5tZWRpYURldmljZXMuZW51bWVyYXRlRGV2aWNlcygpXG5cdFx0LnRoZW4oZnVuY3Rpb24oZGV2aWNlcykge1xuXHRcdFx0Ly8gRmlsdGVyIHRvIHZhbGlkIGRldmljZXNcblx0XHRcdHZhciBhdWRpb0RldmljZXMgPSBkZXZpY2VzLmZpbHRlcihmdW5jdGlvbihkZXZpY2UpIHtcblx0XHRcdFx0cmV0dXJuIGRldmljZS5raW5kID09ICdhdWRpb2lucHV0Jztcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBSZS1wb3B1bGF0ZSB0aGUgc291cmNlIHNlbGVjdG9yIG9wdGlvbnNcblx0XHRcdHJlbW92ZUFsbENoaWxkcmVuKGNvbnRyb2xFbGVtZW50cy5zb3VyY2UpO1xuXG5cdFx0XHRhdWRpb0RldmljZXMuZm9yRWFjaChmdW5jdGlvbihkZXZpY2UpIHtcblx0XHRcdFx0Ly8gQ3JlYXRlIGFuIDxvcHRpb24+XG5cdFx0XHRcdHZhciBkZXZpY2VPcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcblx0XHRcdFx0ZGV2aWNlT3B0aW9uLnZhbHVlID0gZGV2aWNlLmRldmljZUlkO1xuXHRcdFx0XHRkZXZpY2VPcHRpb24udGV4dENvbnRlbnQgPSAoZGV2aWNlLmxhYmVsID8gZGV2aWNlLmxhYmVsIDogZGV2aWNlLmRldmljZUlkKTtcblxuXHRcdFx0XHRjb250cm9sRWxlbWVudHMuc291cmNlLmFwcGVuZENoaWxkKGRldmljZU9wdGlvbik7XG5cblx0XHRcdFx0aWYoZGV2aWNlLmRldmljZUlkID09IGNvbnRyb2xzLnNvdXJjZSkge1xuXHRcdFx0XHRcdC8vIFRoaXMgaXMgdGhlIGFjdGl2ZSBzb3VyY2Ugc28gbWFrZSBzdXJlIHRoZSBzZWxlY3RvciBtYXRjaGVzXG5cdFx0XHRcdFx0Y29udHJvbEVsZW1lbnRzLnNvdXJjZS52YWx1ZSA9IGRldmljZU9wdGlvbi52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgYSBjaGFuZ2UgZXZlbnQgc28gdGhlIGFjdGl2ZSBzb3VyY2UgbWF0Y2hlcyB0aGUgc2VsZWN0b3Jcblx0XHRcdGNvbnRyb2xFbGVtZW50cy5zb3VyY2UuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblx0XHR9KVxuXHRcdC5jYXRjaChmdW5jdGlvbihlcnJvcikge1xuXHRcdFx0YWxlcnQoJ1VuYWJsZSB0byBmZXRjaCBhdWRpbyBkZXZpY2VzJyk7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdVbmFibGVkIHRvIGZldGNoIGF1ZGlvIGRldmljZXMnLCBlcnJvcik7XG5cdFx0fSlcbn0oKTtcblxuY29udHJvbEVsZW1lbnRzLnNvdXJjZS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBjaGFuZ2VBdWRpb1NvdXJjZSA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdHZhciBjaG9zZW5Tb3VyY2UgPSBjb250cm9sRWxlbWVudHMuc291cmNlLnZhbHVlO1xuXG5cdGlmKGNob3NlblNvdXJjZSAhPSBjb250cm9scy5zb3VyY2UpIHtcblx0XHQvLyBEaWZmZXJlbnQgc291cmNlIGhhcyBiZWVuIGNob3NlbiwgdHJpZ2dlciB1cGRhdGVzXG5cdFx0Y29udHJvbHMuc291cmNlID0gY2hvc2VuU291cmNlO1xuXG5cdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjb250cm9scy5zb3VyY2UuY2hhbmdlJykpO1xuXHR9XG59KTtcblxudmFyIF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5jaGFuZ2VBdWRpb0R1cmF0aW9uID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0Ly8gX2R1cmF0aW9uQ2hhbmdlVGltZW91dCBpcyBhIGdsb2JhbCB0aGF0J3MgZWZmZWN0aXZlbHkgZGVib3VuY2luZyB0aGlzIGZ1bmN0aW9uXG5cdGlmKF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNsZWFyVGltZW91dChfZHVyYXRpb25DaGFuZ2VUaW1lb3V0KTtcblx0fVxuXG5cdF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cblx0XHR2YXIgY2hvc2VuRHVyYXRpb24gPSBjb250cm9sRWxlbWVudHMuZHVyYXRpb24udmFsdWU7XG5cblx0XHRpZihjaG9zZW5EdXJhdGlvbiAhPSBjb250cm9scy5kdXJhdGlvbikge1xuXHRcdFx0Ly8gRGlmZmVyZW50IGR1cmF0aW9uIGhhcyBiZWVuIGVudGVyZWQsIHRyaWdnZXIgdXBkYXRlc1xuXHRcdFx0Y29udHJvbHMuZHVyYXRpb24gPSBjaG9zZW5EdXJhdGlvbjtcblxuXHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjb250cm9scy5kdXJhdGlvbi5jaGFuZ2UnKSk7XG5cdFx0fVxuXHR9LCA1MDApO1xufSgpO1xuY29udHJvbEVsZW1lbnRzLmR1cmF0aW9uLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgY2hhbmdlQXVkaW9EdXJhdGlvbik7XG5cbnZhciBfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuY2hhbmdlQXVkaW9EdXJhdGlvbiA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdC8vIF9jaGFubmVsc0NoYW5nZVRpbWVvdXQgaXMgYSBnbG9iYWwgdGhhdCdzIGVmZmVjdGl2ZWx5IGRlYm91bmNpbmcgdGhpcyBmdW5jdGlvblxuXHRpZihfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRjbGVhclRpbWVvdXQoX2NoYW5uZWxzQ2hhbmdlVGltZW91dCk7XG5cdH1cblxuXHRfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXG5cdFx0dmFyIGNob3NlbkNoYW5uZWxzID0gY29udHJvbEVsZW1lbnRzLmNoYW5uZWxzLnZhbHVlO1xuXG5cdFx0aWYoY2hvc2VuQ2hhbm5lbHMgIT0gY29udHJvbHMuY2hhbm5lbHMpIHtcblx0XHRcdC8vIERpZmZlcmVudCBjaGFubmVscyBoYXMgYmVlbiBlbnRlcmVkLCB0cmlnZ2VyIHVwZGF0ZXNcblx0XHRcdGNvbnRyb2xzLmNoYW5uZWxzID0gY2hvc2VuQ2hhbm5lbHM7XG5cblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29udHJvbHMuY2hhbm5lbHMuY2hhbmdlJykpO1xuXHRcdH1cblx0fSwgNTAwKTtcbn0oKTtcbmNvbnRyb2xFbGVtZW50cy5jaGFubmVscy5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGNoYW5nZUF1ZGlvRHVyYXRpb24pO1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYXVkaW8ucmVjb3JkaW5nJywgZW5hYmxlU2F2ZUF1ZGlvID0gZnVuY3Rpb24oKSB7XG5cdGNvbnRyb2xFbGVtZW50cy5zYXZlLmRpc2FibGVkID0gZmFsc2U7XG59KTtcblxuY29udHJvbEVsZW1lbnRzLnNhdmUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGlja1NhdmVBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbnRyb2xzLnNhdmUnKSk7XG59KTsiLCJ2YXIgbG9nRWxlbWVudHMgPSB7XG5cdHRhYmxlQm9keTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ19fYm9keScpLFxuXHR0YWJsZU5vQXVkaW86IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dfX25vLWF1ZGlvJyksXG5cdGNsZWFyQnV0dG9uOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbG9nX19jbGVhcicpLFxufTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2F1ZGlvLnNhdmVkJywgdXBkYXRlTG9nVGFibGUgPSBmdW5jdGlvbigpIHtcblx0aWYoIWF1ZGlvLnNhdmVzLmxlbmd0aCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIFJlbW92ZSB0aGUgXCJubyBzYXZlc1wiIG5vdGljZVxuXHRsb2dFbGVtZW50cy50YWJsZU5vQXVkaW8uc3R5bGUgPSAnZGlzcGxheTpub25lJztcblxuXHQvLyBBZGQgdGhlIGxhdGVzdCBzYXZlXG5cdHZhciBsYXRlc3RTYXZlSW5kZXggPSBhdWRpby5zYXZlcy5sZW5ndGggLSAxO1xuXHR2YXIgbGF0ZXN0U2F2ZSA9IGF1ZGlvLnNhdmVzW2xhdGVzdFNhdmVJbmRleF07XG5cblx0dmFyIHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7XG5cdHJvdy5zYXZlSW5kZXggPSBsYXRlc3RTYXZlSW5kZXg7XG5cdHJvdy5pbm5lckhUTUwgPSBgXG5cdFx0PHRkIGNsYXNzPVwidGV4dC1ub3dyYXAgcHItMlwiPlxuXHRcdFx0JHtsYXRlc3RTYXZlLnRpbWVzdGFtcC50b0xvY2FsZVN0cmluZygpfVxuXHRcdDwvdGQ+XG5cdFx0PHRkIGNsYXNzPVwidGV4dC1ub3dyYXBcIj5cblx0XHRcdCR7bGF0ZXN0U2F2ZS5maWxlbmFtZX1cblx0XHQ8L3RkPlxuXHRcdDx0ZCBjbGFzcz1cInRleHQtbm93cmFwIHBsLTJcIj5cblx0XHRcdDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGRhdGEtYWN0aW9uPVwiZG93bmxvYWRcIiBjbGFzcz1cImJ0biBidG4tc3VjY2VzcyBidG4tc21cIj5Eb3dubG9hZDwvYnV0dG9uPlxuXHRcdDwvdGQ+XG5cdGA7XG5cblx0bG9nRWxlbWVudHMudGFibGVCb2R5LmFwcGVuZENoaWxkKHJvdyk7XG59KTtcblxubG9nRWxlbWVudHMudGFibGVCb2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZG93bmxvYWRTYXZlZEF1ZGlvID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0aWYoZXZlbnQudGFyZ2V0ICYmIGV2ZW50LnRhcmdldC5tYXRjaGVzKCdbZGF0YS1hY3Rpb249XCJkb3dubG9hZFwiXScpKSB7XG5cdFx0Ly8gRmluZCB0aGUgc2F2ZSBhbmQgZG93bmxvYWQgaXRcblx0XHR2YXIgcm93ID0gZXZlbnQudGFyZ2V0LmNsb3Nlc3QoJ3RyJyk7XG5cdFx0dmFyIHNhdmUgPSBhdWRpby5zYXZlc1tyb3cuc2F2ZUluZGV4XTtcblxuXHRcdHRyaWdnZXJEb3dubG9hZChzYXZlLmRhdGEsIHNhdmUuZmlsZW5hbWUpO1xuXHR9XG59KTtcblxubG9nRWxlbWVudHMuY2xlYXJCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGVhclNhdmVkQXVkaW8gPSBmdW5jdGlvbihldmVudCkge1xuXHQvLyBDbGVhciB0aGUgc2F2ZSBkYXRhXG5cdGF1ZGlvLnNhdmVzID0gW107XG5cblx0Ly8gUmVzZXQgdGhlIGxvZyB0YWJsZVxuXHRBcnJheS5mcm9tKGxvZ0VsZW1lbnRzLnRhYmxlQm9keS5xdWVyeVNlbGVjdG9yQWxsKCd0cjpub3QoI2xvZ19fbm8tYXVkaW8pJykpLm1hcChyZW1vdmVFbGVtZW50KTtcblxuXHRsb2dFbGVtZW50cy50YWJsZU5vQXVkaW8uc3R5bGUgPSAnJztcbn0pOyJdfQ==
