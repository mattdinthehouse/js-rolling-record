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
function removeAllChildren(element) {
	while(element.firstChild) {
		element.removeChild(element.firstChild);
	}
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

window.addEventListener('audio.recorder.start', enableSaveAudio = function() {
	controlElements.save.disabled = false;
});

controlElements.save.addEventListener('click', clickSaveAudio = function() {
	window.dispatchEvent(new Event('controls.save'));
});
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImF1ZGlvLmpzIiwiY29tbW9uLmpzIiwiY29udHJvbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUM1R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6InNjcmlwdHMuanMiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgYXVkaW8gPSB7XG5cdHJlY29yZGVyOiB1bmRlZmluZWQsXG5cdGNvbnRleHQ6IG5ldyBBdWRpb0NvbnRleHQoeyBzYW1wbGVSYXRlOiA0NDEwMCB9KSxcblx0c3RyZWFtOiB1bmRlZmluZWQsXG5cdGJ1ZmZlckxlbmd0aDogMCxcblx0Y2h1bmtzOiBbXSxcblx0c2F2ZXM6IFtdLFxufTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbnRyb2xzLnNvdXJjZS5jaGFuZ2UnLCBzdGFydFJlY29yZGluZ0F1ZGlvID0gZnVuY3Rpb24oKSB7XG5cdC8vIE9wZW4gdGhlIGNob3NlbiBzb3VyY2UgYXQgNDQuMWsgc2FtcGxlIHJhdGUsIDMyLWJpdFxuXHR2YXIgY29uc3RyYWludHMgPSB7XG5cdFx0YXVkaW86IHtcblx0XHRcdGRldmljZUlkOiBjb250cm9scy5zb3VyY2UsXG5cdFx0XHRzYW1wbGVSYXRlOiA0NDEwMCxcblx0XHRcdHNhbXBsZVNpemU6IDMyLFxuXHRcdFx0Y2hhbm5lbENvdW50OiBjb250cm9scy5jaGFubmVscyxcblx0XHR9LFxuXHRcdHZpZGVvOiBmYWxzZSxcblx0fTtcblxuXHRuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldFVzZXJNZWRpYShjb25zdHJhaW50cylcblx0XHQudGhlbihmdW5jdGlvbihzdHJlYW0pIHtcblx0XHRcdGlmKGF1ZGlvLnN0cmVhbSkge1xuXHRcdFx0XHRhdWRpby5zdHJlYW0uZGlzY29ubmVjdCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRhdWRpby5zdHJlYW0gPSBhdWRpby5jb250ZXh0LmNyZWF0ZU1lZGlhU3RyZWFtU291cmNlKHN0cmVhbSk7XG5cdFx0XHRhdWRpby5idWZmZXJMZW5ndGggPSAwO1xuXHRcdFx0YXVkaW8uY2h1bmtzID0gW107XG5cblx0XHRcdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0XHRcdGF1ZGlvLmNodW5rc1tjaGFubmVsXSA9IFtdO1xuXHRcdFx0fVxuXG5cdFx0XHR2YXIgc2NyaXB0UHJvY2Vzc29yTm9kZSA9IGF1ZGlvLmNvbnRleHQuY3JlYXRlU2NyaXB0UHJvY2Vzc29yKDQwOTYsIGNvbnRyb2xzLmNoYW5uZWxzLCBjb250cm9scy5jaGFubmVscyk7XG5cdFx0XHRzY3JpcHRQcm9jZXNzb3JOb2RlLmFkZEV2ZW50TGlzdGVuZXIoJ2F1ZGlvcHJvY2VzcycsIHJlY29yZEF1ZGlvKTtcblxuXHRcdFx0YXVkaW8uc3RyZWFtLmNvbm5lY3Qoc2NyaXB0UHJvY2Vzc29yTm9kZSk7XG5cblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnYXVkaW8ucmVjb3JkZXIuc3RhcnQnKSk7XG5cblx0XHRcdHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGF1ZGlvLnN0cmVhbS5kaXNjb25uZWN0KCk7XG5cdFx0XHRcdGF1ZGlvLnN0cmVhbSA9IHVuZGVmaW5lZDtcblx0XHRcdH0sIDMwMDApO1xuXHRcdH0pXG5cdFx0LmNhdGNoKGZ1bmN0aW9uKGVycm9yKSB7XG5cdFx0XHRhbGVydCgnVW5hYmxlIHRvIG9wZW4gYXVkaW8gc3RyZWFtJyk7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdVbmFibGUgdG8gb3BlbiBhdWRpbyBzdHJlYW0nLCBlcnJvcik7XG5cdFx0fSlcbn0pO1xuXG5yZWNvcmRBdWRpbyA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0YXVkaW8uY2h1bmtzW2NoYW5uZWxdLnB1c2goZXZlbnQuaW5wdXRCdWZmZXIuZ2V0Q2hhbm5lbERhdGEoY2hhbm5lbCkpO1xuXHR9XG5cblx0YXVkaW8uYnVmZmVyTGVuZ3RoICs9IGF1ZGlvLmNodW5rc1swXVthdWRpby5jaHVua3NbMF0ubGVuZ3RoIC0gMV0ubGVuZ3RoO1xuXG5cdC8vIFRPRE86IFRyaW0gYXVkaW8gZnJvbSB0aGF0J3MgdG9vIG9sZFxufVxuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY29udHJvbHMuc2F2ZScsIHNhdmVBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHQvLyBHZW5lcmF0ZSB0aGUgYXVkaW8gZmlsZVxuXHR2YXIgbWVyZ2VkID0gW107XG5cdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0bWVyZ2VkW2NoYW5uZWxdID0gbmV3IEZsb2F0MzJBcnJheShhdWRpby5idWZmZXJMZW5ndGgpO1xuXG5cdFx0Zm9yKHZhciBpID0gMCwgb2Zmc2V0ID0gMDsgaSA8IGF1ZGlvLmNodW5rc1tjaGFubmVsXS5sZW5ndGg7IGkrKykge1xuXHRcdFx0bWVyZ2VkW2NoYW5uZWxdLnNldChhdWRpby5jaHVua3NbY2hhbm5lbF1baV0sIG9mZnNldCk7XG5cdFx0XHRvZmZzZXQgKz0gYXVkaW8uY2h1bmtzW2NoYW5uZWxdW2ldLmxlbmd0aDtcblx0XHR9XG5cdH1cblxuXHR2YXIgaW50ZXJsZWF2ZWQgPSBuZXcgRmxvYXQzMkFycmF5KGF1ZGlvLmJ1ZmZlckxlbmd0aCAqIGNvbnRyb2xzLmNoYW5uZWxzKTtcblx0Zm9yKHZhciBpID0gMCwgaiA9IDA7IGkgPCBpbnRlcmxlYXZlZC5sZW5ndGg7IGorKykge1xuXHRcdGZvcih2YXIgY2hhbm5lbCA9IDA7IGNoYW5uZWwgPCBjb250cm9scy5jaGFubmVsczsgY2hhbm5lbCsrKSB7XG5cdFx0XHRpbnRlcmxlYXZlZFtpKytdID0gbWVyZ2VkW2NoYW5uZWxdW2pdO1xuXHRcdH1cblx0fVxuXG5cdHZhciB3YXZEYXRhID0gZW5jb2RlV0FWKGludGVybGVhdmVkLCA0NDEwMCwgY29udHJvbHMuY2hhbm5lbHMpO1xuXG5cdHZhciBibG9iID0gbmV3IEJsb2IoW3dhdkRhdGFdLCB7XG5cdFx0dHlwZTogJ2F1ZGlvL3dhdicsXG5cdH0pO1xuXG5cdC8vIEdlbmVyYXRlIGEgZmlsZW5hbWVcblx0dmFyIGZpbGVuYW1lID0gJycrKG5ldyBEYXRlKCkpLmdldFRpbWUoKSsnLndhdic7XG5cblx0Ly8gRG93bmxvYWQgaXRcblx0dHJpZ2dlckRvd25sb2FkKGJsb2IsIGZpbGVuYW1lKTtcbn0pO1xuXG50cmlnZ2VyRG93bmxvYWQgPSBmdW5jdGlvbihibG9iLCBmaWxlbmFtZSkge1xuXHR2YXIgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0YS50YXJnZXQgPSAnX2JsYW5rJztcblx0YS5ocmVmID0gd2luZG93LlVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG5cdGEuZG93bmxvYWQgPSBmaWxlbmFtZTtcblxuXHRhLnN0eWxlID0gJ2Rpc3BsYXk6bm9uZSc7XG5cdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYSk7XG5cblx0YS5jbGljaygpO1xuXG5cdHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKGEuaHJlZik7XG5cdGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYSk7XG59IiwiZnVuY3Rpb24gcmVtb3ZlQWxsQ2hpbGRyZW4oZWxlbWVudCkge1xuXHR3aGlsZShlbGVtZW50LmZpcnN0Q2hpbGQpIHtcblx0XHRlbGVtZW50LnJlbW92ZUNoaWxkKGVsZW1lbnQuZmlyc3RDaGlsZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZW5jb2RlV0FWKHNhbXBsZXMsIHNhbXBsZVJhdGUsIG51bUNoYW5uZWxzKSB7XG5cdC8vIFJpcHBlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXR0ZGlhbW9uZC9SZWNvcmRlcmpzL2Jsb2IvbWFzdGVyL2xpYi9yZWNvcmRlci5qcyNMMTcwXG5cdHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoNDQgKyBzYW1wbGVzLmxlbmd0aCAqIDIpO1xuXHR2YXIgdmlldyA9IG5ldyBEYXRhVmlldyhidWZmZXIpO1xuXG5cdC8qIFJJRkYgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAwLCAnUklGRicpO1xuXHQvKiBSSUZGIGNodW5rIGxlbmd0aCAqL1xuXHR2aWV3LnNldFVpbnQzMig0LCAzNiArIHNhbXBsZXMubGVuZ3RoICogMiwgdHJ1ZSk7XG5cdC8qIFJJRkYgdHlwZSAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCA4LCAnV0FWRScpO1xuXHQvKiBmb3JtYXQgY2h1bmsgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAxMiwgJ2ZtdCAnKTtcblx0LyogZm9ybWF0IGNodW5rIGxlbmd0aCAqL1xuXHR2aWV3LnNldFVpbnQzMigxNiwgMTYsIHRydWUpO1xuXHQvKiBzYW1wbGUgZm9ybWF0IChyYXcpICovXG5cdHZpZXcuc2V0VWludDE2KDIwLCAxLCB0cnVlKTtcblx0LyogY2hhbm5lbCBjb3VudCAqL1xuXHR2aWV3LnNldFVpbnQxNigyMiwgbnVtQ2hhbm5lbHMsIHRydWUpO1xuXHQvKiBzYW1wbGUgcmF0ZSAqL1xuXHR2aWV3LnNldFVpbnQzMigyNCwgc2FtcGxlUmF0ZSwgdHJ1ZSk7XG5cdC8qIGJ5dGUgcmF0ZSAoc2FtcGxlIHJhdGUgKiBibG9jayBhbGlnbikgKi9cblx0dmlldy5zZXRVaW50MzIoMjgsIHNhbXBsZVJhdGUgKiA0LCB0cnVlKTtcblx0LyogYmxvY2sgYWxpZ24gKGNoYW5uZWwgY291bnQgKiBieXRlcyBwZXIgc2FtcGxlKSAqL1xuXHR2aWV3LnNldFVpbnQxNigzMiwgbnVtQ2hhbm5lbHMgKiAyLCB0cnVlKTtcblx0LyogYml0cyBwZXIgc2FtcGxlICovXG5cdHZpZXcuc2V0VWludDE2KDM0LCAxNiwgdHJ1ZSk7XG5cdC8qIGRhdGEgY2h1bmsgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAzNiwgJ2RhdGEnKTtcblx0LyogZGF0YSBjaHVuayBsZW5ndGggKi9cblx0dmlldy5zZXRVaW50MzIoNDAsIHNhbXBsZXMubGVuZ3RoICogMiwgdHJ1ZSk7XG5cblx0ZmxvYXRUbzE2Qml0UENNKHZpZXcsIDQ0LCBzYW1wbGVzKTtcblxuXHRyZXR1cm4gdmlldztcbn1cblxuZnVuY3Rpb24gZmxvYXRUbzE2Qml0UENNKG91dHB1dCwgb2Zmc2V0LCBpbnB1dCkge1xuXHQvLyBSaXBwZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbWF0dGRpYW1vbmQvUmVjb3JkZXJqcy9ibG9iL21hc3Rlci9saWIvcmVjb3JkZXIuanMjTDE1N1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrLCBvZmZzZXQgKz0gMikge1xuXHRcdHZhciBzID0gTWF0aC5tYXgoLTEsIE1hdGgubWluKDEsIGlucHV0W2ldKSk7XG5cdFx0b3V0cHV0LnNldEludDE2KG9mZnNldCwgcyA8IDAgPyBzICogMHg4MDAwIDogcyAqIDB4N0ZGRiwgdHJ1ZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gd3JpdGVTdHJpbmcodmlldywgb2Zmc2V0LCBzdHJpbmcpIHtcblx0Ly8gUmlwcGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21hdHRkaWFtb25kL1JlY29yZGVyanMvYmxvYi9tYXN0ZXIvbGliL3JlY29yZGVyLmpzI0wxNjRcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBzdHJpbmcubGVuZ3RoOyBpKyspIHtcblx0XHR2aWV3LnNldFVpbnQ4KG9mZnNldCArIGksIHN0cmluZy5jaGFyQ29kZUF0KGkpKTtcblx0fVxufSIsInZhciBjb250cm9scyA9IHtcblx0c291cmNlOiB1bmRlZmluZWQsXG5cdGR1cmF0aW9uOiB1bmRlZmluZWQsXG5cdGNoYW5uZWxzOiB1bmRlZmluZWQsXG59O1xuXG52YXIgY29udHJvbEVsZW1lbnRzID0ge1xuXHRzb3VyY2U6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1zb3VyY2UnKSxcblx0ZHVyYXRpb246IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1kdXJhdGlvbicpLFxuXHRjaGFubmVsczogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F1ZGlvLWNoYW5uZWxzJyksXG5cdHNhdmU6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdWRpby1zYXZlJyksXG59XG5cbnBvcHVsYXRlQXVkaW9Tb3VyY2VzID0gZnVuY3Rpb24oKSB7XG5cdG5hdmlnYXRvci5tZWRpYURldmljZXMuZW51bWVyYXRlRGV2aWNlcygpXG5cdFx0LnRoZW4oZnVuY3Rpb24oZGV2aWNlcykge1xuXHRcdFx0Ly8gRmlsdGVyIHRvIHZhbGlkIGRldmljZXNcblx0XHRcdHZhciBhdWRpb0RldmljZXMgPSBkZXZpY2VzLmZpbHRlcihmdW5jdGlvbihkZXZpY2UpIHtcblx0XHRcdFx0cmV0dXJuIGRldmljZS5raW5kID09ICdhdWRpb2lucHV0Jztcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBSZS1wb3B1bGF0ZSB0aGUgc291cmNlIHNlbGVjdG9yIG9wdGlvbnNcblx0XHRcdHJlbW92ZUFsbENoaWxkcmVuKGNvbnRyb2xFbGVtZW50cy5zb3VyY2UpO1xuXG5cdFx0XHRhdWRpb0RldmljZXMuZm9yRWFjaChmdW5jdGlvbihkZXZpY2UpIHtcblx0XHRcdFx0Ly8gQ3JlYXRlIGFuIDxvcHRpb24+XG5cdFx0XHRcdHZhciBkZXZpY2VPcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcblx0XHRcdFx0ZGV2aWNlT3B0aW9uLnZhbHVlID0gZGV2aWNlLmRldmljZUlkO1xuXHRcdFx0XHRkZXZpY2VPcHRpb24udGV4dENvbnRlbnQgPSAoZGV2aWNlLmxhYmVsID8gZGV2aWNlLmxhYmVsIDogZGV2aWNlLmRldmljZUlkKTtcblxuXHRcdFx0XHRjb250cm9sRWxlbWVudHMuc291cmNlLmFwcGVuZENoaWxkKGRldmljZU9wdGlvbik7XG5cblx0XHRcdFx0aWYoZGV2aWNlLmRldmljZUlkID09IGNvbnRyb2xzLnNvdXJjZSkge1xuXHRcdFx0XHRcdC8vIFRoaXMgaXMgdGhlIGFjdGl2ZSBzb3VyY2Ugc28gbWFrZSBzdXJlIHRoZSBzZWxlY3RvciBtYXRjaGVzXG5cdFx0XHRcdFx0Y29udHJvbEVsZW1lbnRzLnNvdXJjZS52YWx1ZSA9IGRldmljZU9wdGlvbi52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgYSBjaGFuZ2UgZXZlbnQgc28gdGhlIGFjdGl2ZSBzb3VyY2UgbWF0Y2hlcyB0aGUgc2VsZWN0b3Jcblx0XHRcdGNvbnRyb2xFbGVtZW50cy5zb3VyY2UuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScpKTtcblx0XHR9KVxuXHRcdC5jYXRjaChmdW5jdGlvbihlcnJvcikge1xuXHRcdFx0YWxlcnQoJ1VuYWJsZSB0byBmZXRjaCBhdWRpbyBkZXZpY2VzJyk7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdVbmFibGVkIHRvIGZldGNoIGF1ZGlvIGRldmljZXMnLCBlcnJvcik7XG5cdFx0fSlcbn0oKTtcblxuY29udHJvbEVsZW1lbnRzLnNvdXJjZS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBjaGFuZ2VBdWRpb1NvdXJjZSA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdHZhciBjaG9zZW5Tb3VyY2UgPSBjb250cm9sRWxlbWVudHMuc291cmNlLnZhbHVlO1xuXG5cdGlmKGNob3NlblNvdXJjZSAhPSBjb250cm9scy5zb3VyY2UpIHtcblx0XHQvLyBEaWZmZXJlbnQgc291cmNlIGhhcyBiZWVuIGNob3NlbiwgdHJpZ2dlciB1cGRhdGVzXG5cdFx0Y29udHJvbHMuc291cmNlID0gY2hvc2VuU291cmNlO1xuXG5cdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjb250cm9scy5zb3VyY2UuY2hhbmdlJykpO1xuXHR9XG59KTtcblxudmFyIF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5jaGFuZ2VBdWRpb0R1cmF0aW9uID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0Ly8gX2R1cmF0aW9uQ2hhbmdlVGltZW91dCBpcyBhIGdsb2JhbCB0aGF0J3MgZWZmZWN0aXZlbHkgZGVib3VuY2luZyB0aGlzIGZ1bmN0aW9uXG5cdGlmKF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNsZWFyVGltZW91dChfZHVyYXRpb25DaGFuZ2VUaW1lb3V0KTtcblx0fVxuXG5cdF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cblx0XHR2YXIgY2hvc2VuRHVyYXRpb24gPSBjb250cm9sRWxlbWVudHMuZHVyYXRpb24udmFsdWU7XG5cblx0XHRpZihjaG9zZW5EdXJhdGlvbiAhPSBjb250cm9scy5kdXJhdGlvbikge1xuXHRcdFx0Ly8gRGlmZmVyZW50IGR1cmF0aW9uIGhhcyBiZWVuIGVudGVyZWQsIHRyaWdnZXIgdXBkYXRlc1xuXHRcdFx0Y29udHJvbHMuZHVyYXRpb24gPSBjaG9zZW5EdXJhdGlvbjtcblxuXHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjb250cm9scy5kdXJhdGlvbi5jaGFuZ2UnKSk7XG5cdFx0fVxuXHR9LCA1MDApO1xufSgpO1xuY29udHJvbEVsZW1lbnRzLmR1cmF0aW9uLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgY2hhbmdlQXVkaW9EdXJhdGlvbik7XG5cbnZhciBfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuY2hhbmdlQXVkaW9EdXJhdGlvbiA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdC8vIF9jaGFubmVsc0NoYW5nZVRpbWVvdXQgaXMgYSBnbG9iYWwgdGhhdCdzIGVmZmVjdGl2ZWx5IGRlYm91bmNpbmcgdGhpcyBmdW5jdGlvblxuXHRpZihfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRjbGVhclRpbWVvdXQoX2NoYW5uZWxzQ2hhbmdlVGltZW91dCk7XG5cdH1cblxuXHRfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRfY2hhbm5lbHNDaGFuZ2VUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXG5cdFx0dmFyIGNob3NlbkNoYW5uZWxzID0gY29udHJvbEVsZW1lbnRzLmNoYW5uZWxzLnZhbHVlO1xuXG5cdFx0aWYoY2hvc2VuQ2hhbm5lbHMgIT0gY29udHJvbHMuY2hhbm5lbHMpIHtcblx0XHRcdC8vIERpZmZlcmVudCBjaGFubmVscyBoYXMgYmVlbiBlbnRlcmVkLCB0cmlnZ2VyIHVwZGF0ZXNcblx0XHRcdGNvbnRyb2xzLmNoYW5uZWxzID0gY2hvc2VuQ2hhbm5lbHM7XG5cblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29udHJvbHMuY2hhbm5lbHMuY2hhbmdlJykpO1xuXHRcdH1cblx0fSwgNTAwKTtcbn0oKTtcbmNvbnRyb2xFbGVtZW50cy5jaGFubmVscy5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGNoYW5nZUF1ZGlvRHVyYXRpb24pO1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYXVkaW8ucmVjb3JkZXIuc3RhcnQnLCBlbmFibGVTYXZlQXVkaW8gPSBmdW5jdGlvbigpIHtcblx0Y29udHJvbEVsZW1lbnRzLnNhdmUuZGlzYWJsZWQgPSBmYWxzZTtcbn0pO1xuXG5jb250cm9sRWxlbWVudHMuc2F2ZS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNsaWNrU2F2ZUF1ZGlvID0gZnVuY3Rpb24oKSB7XG5cdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29udHJvbHMuc2F2ZScpKTtcbn0pOyJdfQ==
