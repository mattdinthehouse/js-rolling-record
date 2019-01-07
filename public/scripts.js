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
};

window.addEventListener('audio.saved', updateLogTable = function() {
	if(!audio.saves.length) {
		return;
	}

	// Remove the "no saves" notice
	document.getElementById('log__no-audio').style = 'display:none';

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
})
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImF1ZGlvLmpzIiwiY29tbW9uLmpzIiwiY29udHJvbHMuanMiLCJsb2cuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3RIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM1R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6InNjcmlwdHMuanMiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgYXVkaW8gPSB7XG5cdGNvbnRleHQ6IG5ldyBBdWRpb0NvbnRleHQoeyBzYW1wbGVSYXRlOiA0NDEwMCB9KSxcblx0c3RyZWFtOiB1bmRlZmluZWQsIC8vIFRoZSBjdXJyZW50IHN0cmVhbSB0aGF0J3MgYmVpbmcgcmVjb3JkZWRcblx0YnVmZmVyTGVuZ3RoOiAwLCAvLyBOdW1iZXIgb2Ygc2FtcGxlc1xuXHRjaHVua0R1cmF0aW9uOiBbXSwgLy8gRHVyYXRpb24gaW4gc2Vjb25kcyBmb3IgZWFjaCBjaHVua1xuXHRjaHVua3M6IFtdLCAvLyBBcnJheSBvZiBjaGFubmVsID0+IHNhbXBsZSBjaHVua3Ncblx0c2F2ZXM6IFtdLFxufTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbnRyb2xzLnNvdXJjZS5jaGFuZ2UnLCBzdGFydFJlY29yZGluZ0F1ZGlvID0gZnVuY3Rpb24oKSB7XG5cdC8vIE9wZW4gdGhlIGNob3NlbiBzb3VyY2UgYXQgNDQuMWsgc2FtcGxlIHJhdGUsIDMyLWJpdFxuXHR2YXIgY29uc3RyYWludHMgPSB7XG5cdFx0YXVkaW86IHtcblx0XHRcdGRldmljZUlkOiBjb250cm9scy5zb3VyY2UsXG5cdFx0XHRzYW1wbGVSYXRlOiA0NDEwMCxcblx0XHRcdHNhbXBsZVNpemU6IDMyLFxuXHRcdFx0Y2hhbm5lbENvdW50OiBjb250cm9scy5jaGFubmVscyxcblx0XHR9LFxuXHRcdHZpZGVvOiBmYWxzZSxcblx0fTtcblxuXHRuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldFVzZXJNZWRpYShjb25zdHJhaW50cylcblx0XHQudGhlbihmdW5jdGlvbihzdHJlYW0pIHtcblx0XHRcdC8vIFN0b3AgYW55IG9sZCBzdHJlYW1zXG5cdFx0XHRpZihhdWRpby5zdHJlYW0pIHtcblx0XHRcdFx0YXVkaW8uc3RyZWFtLmRpc2Nvbm5lY3QoKTtcblxuXHRcdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2F1ZGlvLnN0b3BwZWQnKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlc2V0IGV2ZXJ5dGhpbmdcblx0XHRcdGF1ZGlvLnN0cmVhbSA9IGF1ZGlvLmNvbnRleHQuY3JlYXRlTWVkaWFTdHJlYW1Tb3VyY2Uoc3RyZWFtKTtcblx0XHRcdGF1ZGlvLmJ1ZmZlckxlbmd0aCA9IDA7XG5cdFx0XHRhdWRpby5jaHVua0R1cmF0aW9uID0gW107XG5cdFx0XHRhdWRpby5jaHVua3MgPSBbXTtcblxuXHRcdFx0Zm9yKHZhciBjaGFubmVsID0gMDsgY2hhbm5lbCA8IGNvbnRyb2xzLmNoYW5uZWxzOyBjaGFubmVsKyspIHtcblx0XHRcdFx0YXVkaW8uY2h1bmtzW2NoYW5uZWxdID0gW107XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN0YXJ0IHJlY29yZGluZ1xuXHRcdFx0dmFyIHNjcmlwdFByb2Nlc3Nvck5vZGUgPSBhdWRpby5jb250ZXh0LmNyZWF0ZVNjcmlwdFByb2Nlc3Nvcig0MDk2LCBjb250cm9scy5jaGFubmVscywgY29udHJvbHMuY2hhbm5lbHMpO1xuXHRcdFx0c2NyaXB0UHJvY2Vzc29yTm9kZS5hZGRFdmVudExpc3RlbmVyKCdhdWRpb3Byb2Nlc3MnLCByZWNvcmRBdWRpbyk7XG5cblx0XHRcdGF1ZGlvLnN0cmVhbS5jb25uZWN0KHNjcmlwdFByb2Nlc3Nvck5vZGUpO1xuXG5cdFx0XHQvLyBOb3RpZnkgc3R1ZmYgdGhhdCByZWNvcmRpbmcncyBiZWd1blxuXHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdhdWRpby5yZWNvcmRpbmcnKSk7XG5cdFx0fSlcblx0XHQuY2F0Y2goZnVuY3Rpb24oZXJyb3IpIHtcblx0XHRcdGFsZXJ0KCdVbmFibGUgdG8gb3BlbiBhdWRpbyBzdHJlYW0nKTtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ1VuYWJsZSB0byBvcGVuIGF1ZGlvIHN0cmVhbScsIGVycm9yKTtcblx0XHR9KVxufSk7XG5cbnJlY29yZEF1ZGlvID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0Ly8gU2F2ZSB0aGUgYXVkaW8gZGF0YVxuXHRmb3IodmFyIGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgY29udHJvbHMuY2hhbm5lbHM7IGNoYW5uZWwrKykge1xuXHRcdGF1ZGlvLmNodW5rc1tjaGFubmVsXS5wdXNoKGV2ZW50LmlucHV0QnVmZmVyLmdldENoYW5uZWxEYXRhKGNoYW5uZWwpKTtcblx0fVxuXG5cdC8vIEluY3JlbWVudCB0aGUgYnVmZmVyJ3MgbGVuZ3RoIChpbiBzYW1wbGVzKSBhbmQgZHVyYXRpb24gKGluIHNlY29uZHMpXG5cdGF1ZGlvLmJ1ZmZlckxlbmd0aCArPSBldmVudC5pbnB1dEJ1ZmZlci5sZW5ndGg7XG5cdGF1ZGlvLmNodW5rRHVyYXRpb24ucHVzaChldmVudC5pbnB1dEJ1ZmZlci5kdXJhdGlvbik7XG5cblx0Ly8gVHJpbSBhdWRpbyB0aGF0J3MgdG9vIG9sZFxuXHR2YXIgc3VtQnVmZmVyRHVyYXRpb24gPSBzdW1PZkFycmF5KGF1ZGlvLmNodW5rRHVyYXRpb24pO1xuXHR3aGlsZShzdW1CdWZmZXJEdXJhdGlvbiA+IGNvbnRyb2xzLmR1cmF0aW9uKSB7XG5cdFx0Ly8gUmVtb3ZlIHRoZSBvbGRlc3QgYml0c1xuXHRcdHN1bUJ1ZmZlckR1cmF0aW9uIC09IGF1ZGlvLmNodW5rRHVyYXRpb24uc2hpZnQoKTtcblx0XHRhdWRpby5idWZmZXJMZW5ndGggLT0gYXVkaW8uY2h1bmtzWzBdLnNoaWZ0KCkubGVuZ3RoO1xuXG5cdFx0Ly8gY2hhbm5lbCA9IDEgYmVjYXVzZSAwIGhhcyBhbHJlYWR5IGJlZW4gLnNoaWZ0KCknZFxuXHRcdGZvcih2YXIgY2hhbm5lbCA9IDE7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0XHRhdWRpby5jaHVua3NbY2hhbm5lbF0uc2hpZnQoKTtcblx0XHR9XG5cdH1cbn1cblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbnRyb2xzLnNhdmUnLCBzYXZlQXVkaW8gPSBmdW5jdGlvbigpIHtcblx0Ly8gR2VuZXJhdGUgdGhlIGF1ZGlvIGZpbGVcblx0Ly8gMS4gTWVyZ2UgZWFjaCBjaGFubmVsJ3MgZGF0YSBpbnRvIGEgc2luZ2xlIGJ1ZmZlciByZXNwZWN0aXZlbHlcblx0dmFyIG1lcmdlZCA9IFtdO1xuXHRmb3IodmFyIGNoYW5uZWwgPSAwOyBjaGFubmVsIDwgY29udHJvbHMuY2hhbm5lbHM7IGNoYW5uZWwrKykge1xuXHRcdG1lcmdlZFtjaGFubmVsXSA9IG5ldyBGbG9hdDMyQXJyYXkoYXVkaW8uYnVmZmVyTGVuZ3RoKTtcblxuXHRcdGZvcih2YXIgaSA9IDAsIG9mZnNldCA9IDA7IGkgPCBhdWRpby5jaHVua3NbY2hhbm5lbF0ubGVuZ3RoOyBpKyspIHtcblx0XHRcdG1lcmdlZFtjaGFubmVsXS5zZXQoYXVkaW8uY2h1bmtzW2NoYW5uZWxdW2ldLCBvZmZzZXQpO1xuXHRcdFx0b2Zmc2V0ICs9IGF1ZGlvLmNodW5rc1tjaGFubmVsXVtpXS5sZW5ndGg7XG5cdFx0fVxuXHR9XG5cblx0Ly8gMi4gSW50ZXJsZWF2ZSB0aGUgY2hhbm5lbCBidWZmZXJzIGludG8gYSBzaW5nbGUgYnVmZmVyXG5cdHZhciBpbnRlcmxlYXZlZCA9IG5ldyBGbG9hdDMyQXJyYXkoYXVkaW8uYnVmZmVyTGVuZ3RoICogY29udHJvbHMuY2hhbm5lbHMpO1xuXHRmb3IodmFyIGkgPSAwLCBqID0gMDsgaSA8IGludGVybGVhdmVkLmxlbmd0aDsgaisrKSB7XG5cdFx0Zm9yKHZhciBjaGFubmVsID0gMDsgY2hhbm5lbCA8IGNvbnRyb2xzLmNoYW5uZWxzOyBjaGFubmVsKyspIHtcblx0XHRcdGludGVybGVhdmVkW2krK10gPSBtZXJnZWRbY2hhbm5lbF1bal07XG5cdFx0fVxuXHR9XG5cblx0dmFyIHdhdkRhdGEgPSBlbmNvZGVXQVYoaW50ZXJsZWF2ZWQsIDQ0MTAwLCBjb250cm9scy5jaGFubmVscyk7XG5cblx0dmFyIGJsb2IgPSBuZXcgQmxvYihbd2F2RGF0YV0sIHtcblx0XHR0eXBlOiAnYXVkaW8vd2F2Jyxcblx0fSk7XG5cblx0Ly8gR2VuZXJhdGUgYSBmaWxlbmFtZVxuXHR2YXIgZmlsZW5hbWUgPSAnJysobmV3IERhdGUoKSkuZ2V0VGltZSgpKycud2F2JztcblxuXHQvLyBEb3dubG9hZCBpdCBhbmQgc2F2ZVxuXHR0cmlnZ2VyRG93bmxvYWQoYmxvYiwgZmlsZW5hbWUpO1xuXHRhdWRpby5zYXZlcy5wdXNoKHtcblx0XHRkYXRhOiBibG9iLFxuXHRcdGZpbGVuYW1lOiBmaWxlbmFtZSxcblx0XHR0aW1lc3RhbXA6IG5ldyBEYXRlKCksXG5cdH0pO1xuXG5cdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYXVkaW8uc2F2ZWQnKSk7XG59KTsiLCJmdW5jdGlvbiByZW1vdmVBbGxDaGlsZHJlbihlbGVtZW50KSB7XG5cdHdoaWxlKGVsZW1lbnQuZmlyc3RDaGlsZCkge1xuXHRcdGVsZW1lbnQucmVtb3ZlQ2hpbGQoZWxlbWVudC5maXJzdENoaWxkKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzdW1PZkFycmF5KGFycmF5KSB7XG5cdHJldHVybiBhcnJheS5yZWR1Y2UoZnVuY3Rpb24oc3VtLCB2YWx1ZSkge1xuXHRcdHJldHVybiBzdW0gKyB2YWx1ZTtcblx0fSwgMCk7XG59XG5cbmZ1bmN0aW9uIHRyaWdnZXJEb3dubG9hZChibG9iLCBmaWxlbmFtZSkge1xuXHR2YXIgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0YS50YXJnZXQgPSAnX2JsYW5rJztcblx0YS5ocmVmID0gd2luZG93LlVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG5cdGEuZG93bmxvYWQgPSBmaWxlbmFtZTtcblxuXHRhLnN0eWxlID0gJ2Rpc3BsYXk6bm9uZSc7XG5cdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYSk7XG5cblx0YS5jbGljaygpO1xuXG5cdHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKGEuaHJlZik7XG5cdGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYSk7XG59XG5cbmZ1bmN0aW9uIGVuY29kZVdBVihzYW1wbGVzLCBzYW1wbGVSYXRlLCBudW1DaGFubmVscykge1xuXHQvLyBSaXBwZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbWF0dGRpYW1vbmQvUmVjb3JkZXJqcy9ibG9iL21hc3Rlci9saWIvcmVjb3JkZXIuanMjTDE3MFxuXHR2YXIgYnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDQ0ICsgc2FtcGxlcy5sZW5ndGggKiAyKTtcblx0dmFyIHZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmZmVyKTtcblxuXHQvKiBSSUZGIGlkZW50aWZpZXIgKi9cblx0d3JpdGVTdHJpbmcodmlldywgMCwgJ1JJRkYnKTtcblx0LyogUklGRiBjaHVuayBsZW5ndGggKi9cblx0dmlldy5zZXRVaW50MzIoNCwgMzYgKyBzYW1wbGVzLmxlbmd0aCAqIDIsIHRydWUpO1xuXHQvKiBSSUZGIHR5cGUgKi9cblx0d3JpdGVTdHJpbmcodmlldywgOCwgJ1dBVkUnKTtcblx0LyogZm9ybWF0IGNodW5rIGlkZW50aWZpZXIgKi9cblx0d3JpdGVTdHJpbmcodmlldywgMTIsICdmbXQgJyk7XG5cdC8qIGZvcm1hdCBjaHVuayBsZW5ndGggKi9cblx0dmlldy5zZXRVaW50MzIoMTYsIDE2LCB0cnVlKTtcblx0Lyogc2FtcGxlIGZvcm1hdCAocmF3KSAqL1xuXHR2aWV3LnNldFVpbnQxNigyMCwgMSwgdHJ1ZSk7XG5cdC8qIGNoYW5uZWwgY291bnQgKi9cblx0dmlldy5zZXRVaW50MTYoMjIsIG51bUNoYW5uZWxzLCB0cnVlKTtcblx0Lyogc2FtcGxlIHJhdGUgKi9cblx0dmlldy5zZXRVaW50MzIoMjQsIHNhbXBsZVJhdGUsIHRydWUpO1xuXHQvKiBieXRlIHJhdGUgKHNhbXBsZSByYXRlICogYmxvY2sgYWxpZ24pICovXG5cdHZpZXcuc2V0VWludDMyKDI4LCBzYW1wbGVSYXRlICogNCwgdHJ1ZSk7XG5cdC8qIGJsb2NrIGFsaWduIChjaGFubmVsIGNvdW50ICogYnl0ZXMgcGVyIHNhbXBsZSkgKi9cblx0dmlldy5zZXRVaW50MTYoMzIsIG51bUNoYW5uZWxzICogMiwgdHJ1ZSk7XG5cdC8qIGJpdHMgcGVyIHNhbXBsZSAqL1xuXHR2aWV3LnNldFVpbnQxNigzNCwgMTYsIHRydWUpO1xuXHQvKiBkYXRhIGNodW5rIGlkZW50aWZpZXIgKi9cblx0d3JpdGVTdHJpbmcodmlldywgMzYsICdkYXRhJyk7XG5cdC8qIGRhdGEgY2h1bmsgbGVuZ3RoICovXG5cdHZpZXcuc2V0VWludDMyKDQwLCBzYW1wbGVzLmxlbmd0aCAqIDIsIHRydWUpO1xuXG5cdGZsb2F0VG8xNkJpdFBDTSh2aWV3LCA0NCwgc2FtcGxlcyk7XG5cblx0cmV0dXJuIHZpZXc7XG59XG5cbmZ1bmN0aW9uIGZsb2F0VG8xNkJpdFBDTShvdXRwdXQsIG9mZnNldCwgaW5wdXQpIHtcblx0Ly8gUmlwcGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21hdHRkaWFtb25kL1JlY29yZGVyanMvYmxvYi9tYXN0ZXIvbGliL3JlY29yZGVyLmpzI0wxNTdcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBpbnB1dC5sZW5ndGg7IGkrKywgb2Zmc2V0ICs9IDIpIHtcblx0XHR2YXIgcyA9IE1hdGgubWF4KC0xLCBNYXRoLm1pbigxLCBpbnB1dFtpXSkpO1xuXHRcdG91dHB1dC5zZXRJbnQxNihvZmZzZXQsIHMgPCAwID8gcyAqIDB4ODAwMCA6IHMgKiAweDdGRkYsIHRydWUpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHdyaXRlU3RyaW5nKHZpZXcsIG9mZnNldCwgc3RyaW5nKSB7XG5cdC8vIFJpcHBlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXR0ZGlhbW9uZC9SZWNvcmRlcmpzL2Jsb2IvbWFzdGVyL2xpYi9yZWNvcmRlci5qcyNMMTY0XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgc3RyaW5nLmxlbmd0aDsgaSsrKSB7XG5cdFx0dmlldy5zZXRVaW50OChvZmZzZXQgKyBpLCBzdHJpbmcuY2hhckNvZGVBdChpKSk7XG5cdH1cbn0iLCJ2YXIgY29udHJvbHMgPSB7XG5cdHNvdXJjZTogdW5kZWZpbmVkLFxuXHRkdXJhdGlvbjogdW5kZWZpbmVkLFxuXHRjaGFubmVsczogdW5kZWZpbmVkLFxufTtcblxudmFyIGNvbnRyb2xFbGVtZW50cyA9IHtcblx0c291cmNlOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXVkaW8tc291cmNlJyksXG5cdGR1cmF0aW9uOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXVkaW8tZHVyYXRpb24nKSxcblx0Y2hhbm5lbHM6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1jaGFubmVscycpLFxuXHRzYXZlOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXVkaW8tc2F2ZScpLFxufVxuXG5wb3B1bGF0ZUF1ZGlvU291cmNlcyA9IGZ1bmN0aW9uKCkge1xuXHRuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmVudW1lcmF0ZURldmljZXMoKVxuXHRcdC50aGVuKGZ1bmN0aW9uKGRldmljZXMpIHtcblx0XHRcdC8vIEZpbHRlciB0byB2YWxpZCBkZXZpY2VzXG5cdFx0XHR2YXIgYXVkaW9EZXZpY2VzID0gZGV2aWNlcy5maWx0ZXIoZnVuY3Rpb24oZGV2aWNlKSB7XG5cdFx0XHRcdHJldHVybiBkZXZpY2Uua2luZCA9PSAnYXVkaW9pbnB1dCc7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUmUtcG9wdWxhdGUgdGhlIHNvdXJjZSBzZWxlY3RvciBvcHRpb25zXG5cdFx0XHRyZW1vdmVBbGxDaGlsZHJlbihjb250cm9sRWxlbWVudHMuc291cmNlKTtcblxuXHRcdFx0YXVkaW9EZXZpY2VzLmZvckVhY2goZnVuY3Rpb24oZGV2aWNlKSB7XG5cdFx0XHRcdC8vIENyZWF0ZSBhbiA8b3B0aW9uPlxuXHRcdFx0XHR2YXIgZGV2aWNlT3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG5cdFx0XHRcdGRldmljZU9wdGlvbi52YWx1ZSA9IGRldmljZS5kZXZpY2VJZDtcblx0XHRcdFx0ZGV2aWNlT3B0aW9uLnRleHRDb250ZW50ID0gKGRldmljZS5sYWJlbCA/IGRldmljZS5sYWJlbCA6IGRldmljZS5kZXZpY2VJZCk7XG5cblx0XHRcdFx0Y29udHJvbEVsZW1lbnRzLnNvdXJjZS5hcHBlbmRDaGlsZChkZXZpY2VPcHRpb24pO1xuXG5cdFx0XHRcdGlmKGRldmljZS5kZXZpY2VJZCA9PSBjb250cm9scy5zb3VyY2UpIHtcblx0XHRcdFx0XHQvLyBUaGlzIGlzIHRoZSBhY3RpdmUgc291cmNlIHNvIG1ha2Ugc3VyZSB0aGUgc2VsZWN0b3IgbWF0Y2hlc1xuXHRcdFx0XHRcdGNvbnRyb2xFbGVtZW50cy5zb3VyY2UudmFsdWUgPSBkZXZpY2VPcHRpb24udmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIGEgY2hhbmdlIGV2ZW50IHNvIHRoZSBhY3RpdmUgc291cmNlIG1hdGNoZXMgdGhlIHNlbGVjdG9yXG5cdFx0XHRjb250cm9sRWxlbWVudHMuc291cmNlLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XG5cdFx0fSlcblx0XHQuY2F0Y2goZnVuY3Rpb24oZXJyb3IpIHtcblx0XHRcdGFsZXJ0KCdVbmFibGUgdG8gZmV0Y2ggYXVkaW8gZGV2aWNlcycpO1xuXHRcdFx0Y29uc29sZS5lcnJvcignVW5hYmxlZCB0byBmZXRjaCBhdWRpbyBkZXZpY2VzJywgZXJyb3IpO1xuXHRcdH0pXG59KCk7XG5cbmNvbnRyb2xFbGVtZW50cy5zb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgY2hhbmdlQXVkaW9Tb3VyY2UgPSBmdW5jdGlvbihldmVudCkge1xuXHR2YXIgY2hvc2VuU291cmNlID0gY29udHJvbEVsZW1lbnRzLnNvdXJjZS52YWx1ZTtcblxuXHRpZihjaG9zZW5Tb3VyY2UgIT0gY29udHJvbHMuc291cmNlKSB7XG5cdFx0Ly8gRGlmZmVyZW50IHNvdXJjZSBoYXMgYmVlbiBjaG9zZW4sIHRyaWdnZXIgdXBkYXRlc1xuXHRcdGNvbnRyb2xzLnNvdXJjZSA9IGNob3NlblNvdXJjZTtcblxuXHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29udHJvbHMuc291cmNlLmNoYW5nZScpKTtcblx0fVxufSk7XG5cbnZhciBfZHVyYXRpb25DaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuY2hhbmdlQXVkaW9EdXJhdGlvbiA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdC8vIF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgaXMgYSBnbG9iYWwgdGhhdCdzIGVmZmVjdGl2ZWx5IGRlYm91bmNpbmcgdGhpcyBmdW5jdGlvblxuXHRpZihfZHVyYXRpb25DaGFuZ2VUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRjbGVhclRpbWVvdXQoX2R1cmF0aW9uQ2hhbmdlVGltZW91dCk7XG5cdH1cblxuXHRfZHVyYXRpb25DaGFuZ2VUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRfZHVyYXRpb25DaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXG5cdFx0dmFyIGNob3NlbkR1cmF0aW9uID0gY29udHJvbEVsZW1lbnRzLmR1cmF0aW9uLnZhbHVlO1xuXG5cdFx0aWYoY2hvc2VuRHVyYXRpb24gIT0gY29udHJvbHMuZHVyYXRpb24pIHtcblx0XHRcdC8vIERpZmZlcmVudCBkdXJhdGlvbiBoYXMgYmVlbiBlbnRlcmVkLCB0cmlnZ2VyIHVwZGF0ZXNcblx0XHRcdGNvbnRyb2xzLmR1cmF0aW9uID0gY2hvc2VuRHVyYXRpb247XG5cblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29udHJvbHMuZHVyYXRpb24uY2hhbmdlJykpO1xuXHRcdH1cblx0fSwgNTAwKTtcbn0oKTtcbmNvbnRyb2xFbGVtZW50cy5kdXJhdGlvbi5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGNoYW5nZUF1ZGlvRHVyYXRpb24pO1xuXG52YXIgX2NoYW5uZWxzQ2hhbmdlVGltZW91dCA9IHVuZGVmaW5lZDtcbmNoYW5nZUF1ZGlvRHVyYXRpb24gPSBmdW5jdGlvbihldmVudCkge1xuXHQvLyBfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0IGlzIGEgZ2xvYmFsIHRoYXQncyBlZmZlY3RpdmVseSBkZWJvdW5jaW5nIHRoaXMgZnVuY3Rpb25cblx0aWYoX2NoYW5uZWxzQ2hhbmdlVGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y2xlYXJUaW1lb3V0KF9jaGFubmVsc0NoYW5nZVRpbWVvdXQpO1xuXHR9XG5cblx0X2NoYW5uZWxzQ2hhbmdlVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0X2NoYW5uZWxzQ2hhbmdlVGltZW91dCA9IHVuZGVmaW5lZDtcblxuXHRcdHZhciBjaG9zZW5DaGFubmVscyA9IGNvbnRyb2xFbGVtZW50cy5jaGFubmVscy52YWx1ZTtcblxuXHRcdGlmKGNob3NlbkNoYW5uZWxzICE9IGNvbnRyb2xzLmNoYW5uZWxzKSB7XG5cdFx0XHQvLyBEaWZmZXJlbnQgY2hhbm5lbHMgaGFzIGJlZW4gZW50ZXJlZCwgdHJpZ2dlciB1cGRhdGVzXG5cdFx0XHRjb250cm9scy5jaGFubmVscyA9IGNob3NlbkNoYW5uZWxzO1xuXG5cdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbnRyb2xzLmNoYW5uZWxzLmNoYW5nZScpKTtcblx0XHR9XG5cdH0sIDUwMCk7XG59KCk7XG5jb250cm9sRWxlbWVudHMuY2hhbm5lbHMuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBjaGFuZ2VBdWRpb0R1cmF0aW9uKTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2F1ZGlvLnJlY29yZGluZycsIGVuYWJsZVNhdmVBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHRjb250cm9sRWxlbWVudHMuc2F2ZS5kaXNhYmxlZCA9IGZhbHNlO1xufSk7XG5cbmNvbnRyb2xFbGVtZW50cy5zYXZlLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xpY2tTYXZlQXVkaW8gPSBmdW5jdGlvbigpIHtcblx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjb250cm9scy5zYXZlJykpO1xufSk7IiwidmFyIGxvZ0VsZW1lbnRzID0ge1xuXHR0YWJsZUJvZHk6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2dfX2JvZHknKSxcbn07XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdhdWRpby5zYXZlZCcsIHVwZGF0ZUxvZ1RhYmxlID0gZnVuY3Rpb24oKSB7XG5cdGlmKCFhdWRpby5zYXZlcy5sZW5ndGgpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBSZW1vdmUgdGhlIFwibm8gc2F2ZXNcIiBub3RpY2Vcblx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvZ19fbm8tYXVkaW8nKS5zdHlsZSA9ICdkaXNwbGF5Om5vbmUnO1xuXG5cdC8vIEFkZCB0aGUgbGF0ZXN0IHNhdmVcblx0dmFyIGxhdGVzdFNhdmVJbmRleCA9IGF1ZGlvLnNhdmVzLmxlbmd0aCAtIDE7XG5cdHZhciBsYXRlc3RTYXZlID0gYXVkaW8uc2F2ZXNbbGF0ZXN0U2F2ZUluZGV4XTtcblxuXHR2YXIgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcblx0cm93LnNhdmVJbmRleCA9IGxhdGVzdFNhdmVJbmRleDtcblx0cm93LmlubmVySFRNTCA9IGBcblx0XHQ8dGQgY2xhc3M9XCJ0ZXh0LW5vd3JhcCBwci0yXCI+XG5cdFx0XHQke2xhdGVzdFNhdmUudGltZXN0YW1wLnRvTG9jYWxlU3RyaW5nKCl9XG5cdFx0PC90ZD5cblx0XHQ8dGQgY2xhc3M9XCJ0ZXh0LW5vd3JhcFwiPlxuXHRcdFx0JHtsYXRlc3RTYXZlLmZpbGVuYW1lfVxuXHRcdDwvdGQ+XG5cdFx0PHRkIGNsYXNzPVwidGV4dC1ub3dyYXAgcGwtMlwiPlxuXHRcdFx0PGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1hY3Rpb249XCJkb3dubG9hZFwiIGNsYXNzPVwiYnRuIGJ0bi1zdWNjZXNzIGJ0bi1zbVwiPkRvd25sb2FkPC9idXR0b24+XG5cdFx0PC90ZD5cblx0YDtcblxuXHRsb2dFbGVtZW50cy50YWJsZUJvZHkuYXBwZW5kQ2hpbGQocm93KTtcbn0pO1xuXG5sb2dFbGVtZW50cy50YWJsZUJvZHkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBkb3dubG9hZFNhdmVkQXVkaW8gPSBmdW5jdGlvbihldmVudCkge1xuXHRpZihldmVudC50YXJnZXQgJiYgZXZlbnQudGFyZ2V0Lm1hdGNoZXMoJ1tkYXRhLWFjdGlvbj1cImRvd25sb2FkXCJdJykpIHtcblx0XHQvLyBGaW5kIHRoZSBzYXZlIGFuZCBkb3dubG9hZCBpdFxuXHRcdHZhciByb3cgPSBldmVudC50YXJnZXQuY2xvc2VzdCgndHInKTtcblx0XHR2YXIgc2F2ZSA9IGF1ZGlvLnNhdmVzW3Jvdy5zYXZlSW5kZXhdO1xuXG5cdFx0dHJpZ2dlckRvd25sb2FkKHNhdmUuZGF0YSwgc2F2ZS5maWxlbmFtZSk7XG5cdH1cbn0pIl19
