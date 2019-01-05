var audio = {
	recorder: undefined,
	chunks: [],
	saves: [],
};

window.addEventListener('controls.source.change', startRecordingAudio = function() {
	// Open the chosen source at 44.1k sample rate, 16-bit
	var constraints = {
		audio: {
			deviceId: controls.source,
			sampleRate: 44100,
			sampleSize: 16,
		},
		video: false,
	};

	navigator.mediaDevices.getUserMedia(constraints)
		.then(function(stream) {
			// Start recording
			audio.recorder = new MediaRecorder(stream);

			audio.recorder.start(1000);
			audio.chunks = [];

			window.dispatchEvent(new Event('audio.recorder.start'));

			// Save data in chunks of 1sec (because we set a timeslice of 1sec when calling start())
			audio.recorder.addEventListener('dataavailable', function(event) {
				if(audio.recorder.state == 'recording') {
					audio.chunks.push(event.data);

					if(audio.chunks.length > controls.duration) {
						audio.chunks.shift();
					}
				}
			});
		})
		.catch(function(error) {
			alert('Unable to open audio stream');
			console.error('Unable to open audio stream', error);
		})
});

window.addEventListener('controls.save', saveAudio = function() {
	// Generate the audio file
	var blob = new Blob(audio.chunks, {
		type: audio.recorder.mimeType,
	});

	var dataUrl = window.URL.createObjectURL(blob);

	// Generate a filename
	var date = new Date();
	var filename = date.getFullYear()+(date.getMonth()+1)+date.getDate()+'_'+date.getHours()+date.getMinutes()+date.getSeconds()+extensionForMimeType(audio.recorder.mimeType);

	// Download it
	var a = document.createElement('a');
	a.target = '_blank';
	a.href = dataUrl;
	a.download = filename;

	a.style = 'display:none';
	document.body.appendChild(a);

	a.click();

	window.URL.revokeObjectURL(dataUrl);
	document.body.removeChild(a);
});
function removeAllChildren(element) {
	while(element.firstChild) {
		element.removeChild(element.firstChild);
	}
}

function encodeWAV(samples) {
	// Ripped from https://github.com/mattdiamond/Recorderjs/blob/08e7abd99739be6946f19f6806ccb368138f2dd3/lib/recorder.js#L170
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
var controls = {
	source: undefined,
	duration: undefined,
};

var controlElements = {
	source: document.getElementById('audio-source'),
	duration: document.getElementById('audio-duration'),
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

window.addEventListener('audio.recorder.start', enableSaveAudio = function() {
	controlElements.save.disabled = false;
});

controlElements.save.addEventListener('click', clickSaveAudio = function() {
	window.dispatchEvent(new Event('controls.save'));
});
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImF1ZGlvLmpzIiwiY29tbW9uLmpzIiwiY29udHJvbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNyRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6InNjcmlwdHMuanMiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgYXVkaW8gPSB7XG5cdHJlY29yZGVyOiB1bmRlZmluZWQsXG5cdGNodW5rczogW10sXG5cdHNhdmVzOiBbXSxcbn07XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjb250cm9scy5zb3VyY2UuY2hhbmdlJywgc3RhcnRSZWNvcmRpbmdBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHQvLyBPcGVuIHRoZSBjaG9zZW4gc291cmNlIGF0IDQ0LjFrIHNhbXBsZSByYXRlLCAxNi1iaXRcblx0dmFyIGNvbnN0cmFpbnRzID0ge1xuXHRcdGF1ZGlvOiB7XG5cdFx0XHRkZXZpY2VJZDogY29udHJvbHMuc291cmNlLFxuXHRcdFx0c2FtcGxlUmF0ZTogNDQxMDAsXG5cdFx0XHRzYW1wbGVTaXplOiAxNixcblx0XHR9LFxuXHRcdHZpZGVvOiBmYWxzZSxcblx0fTtcblxuXHRuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldFVzZXJNZWRpYShjb25zdHJhaW50cylcblx0XHQudGhlbihmdW5jdGlvbihzdHJlYW0pIHtcblx0XHRcdC8vIFN0YXJ0IHJlY29yZGluZ1xuXHRcdFx0YXVkaW8ucmVjb3JkZXIgPSBuZXcgTWVkaWFSZWNvcmRlcihzdHJlYW0pO1xuXG5cdFx0XHRhdWRpby5yZWNvcmRlci5zdGFydCgxMDAwKTtcblx0XHRcdGF1ZGlvLmNodW5rcyA9IFtdO1xuXG5cdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2F1ZGlvLnJlY29yZGVyLnN0YXJ0JykpO1xuXG5cdFx0XHQvLyBTYXZlIGRhdGEgaW4gY2h1bmtzIG9mIDFzZWMgKGJlY2F1c2Ugd2Ugc2V0IGEgdGltZXNsaWNlIG9mIDFzZWMgd2hlbiBjYWxsaW5nIHN0YXJ0KCkpXG5cdFx0XHRhdWRpby5yZWNvcmRlci5hZGRFdmVudExpc3RlbmVyKCdkYXRhYXZhaWxhYmxlJywgZnVuY3Rpb24oZXZlbnQpIHtcblx0XHRcdFx0aWYoYXVkaW8ucmVjb3JkZXIuc3RhdGUgPT0gJ3JlY29yZGluZycpIHtcblx0XHRcdFx0XHRhdWRpby5jaHVua3MucHVzaChldmVudC5kYXRhKTtcblxuXHRcdFx0XHRcdGlmKGF1ZGlvLmNodW5rcy5sZW5ndGggPiBjb250cm9scy5kdXJhdGlvbikge1xuXHRcdFx0XHRcdFx0YXVkaW8uY2h1bmtzLnNoaWZ0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KVxuXHRcdC5jYXRjaChmdW5jdGlvbihlcnJvcikge1xuXHRcdFx0YWxlcnQoJ1VuYWJsZSB0byBvcGVuIGF1ZGlvIHN0cmVhbScpO1xuXHRcdFx0Y29uc29sZS5lcnJvcignVW5hYmxlIHRvIG9wZW4gYXVkaW8gc3RyZWFtJywgZXJyb3IpO1xuXHRcdH0pXG59KTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbnRyb2xzLnNhdmUnLCBzYXZlQXVkaW8gPSBmdW5jdGlvbigpIHtcblx0Ly8gR2VuZXJhdGUgdGhlIGF1ZGlvIGZpbGVcblx0dmFyIGJsb2IgPSBuZXcgQmxvYihhdWRpby5jaHVua3MsIHtcblx0XHR0eXBlOiBhdWRpby5yZWNvcmRlci5taW1lVHlwZSxcblx0fSk7XG5cblx0dmFyIGRhdGFVcmwgPSB3aW5kb3cuVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcblxuXHQvLyBHZW5lcmF0ZSBhIGZpbGVuYW1lXG5cdHZhciBkYXRlID0gbmV3IERhdGUoKTtcblx0dmFyIGZpbGVuYW1lID0gZGF0ZS5nZXRGdWxsWWVhcigpKyhkYXRlLmdldE1vbnRoKCkrMSkrZGF0ZS5nZXREYXRlKCkrJ18nK2RhdGUuZ2V0SG91cnMoKStkYXRlLmdldE1pbnV0ZXMoKStkYXRlLmdldFNlY29uZHMoKStleHRlbnNpb25Gb3JNaW1lVHlwZShhdWRpby5yZWNvcmRlci5taW1lVHlwZSk7XG5cblx0Ly8gRG93bmxvYWQgaXRcblx0dmFyIGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdGEudGFyZ2V0ID0gJ19ibGFuayc7XG5cdGEuaHJlZiA9IGRhdGFVcmw7XG5cdGEuZG93bmxvYWQgPSBmaWxlbmFtZTtcblxuXHRhLnN0eWxlID0gJ2Rpc3BsYXk6bm9uZSc7XG5cdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYSk7XG5cblx0YS5jbGljaygpO1xuXG5cdHdpbmRvdy5VUkwucmV2b2tlT2JqZWN0VVJMKGRhdGFVcmwpO1xuXHRkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGEpO1xufSk7IiwiZnVuY3Rpb24gcmVtb3ZlQWxsQ2hpbGRyZW4oZWxlbWVudCkge1xuXHR3aGlsZShlbGVtZW50LmZpcnN0Q2hpbGQpIHtcblx0XHRlbGVtZW50LnJlbW92ZUNoaWxkKGVsZW1lbnQuZmlyc3RDaGlsZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZW5jb2RlV0FWKHNhbXBsZXMpIHtcblx0Ly8gUmlwcGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL21hdHRkaWFtb25kL1JlY29yZGVyanMvYmxvYi8wOGU3YWJkOTk3MzliZTY5NDZmMTlmNjgwNmNjYjM2ODEzOGYyZGQzL2xpYi9yZWNvcmRlci5qcyNMMTcwXG5cdHZhciBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoNDQgKyBzYW1wbGVzLmxlbmd0aCAqIDIpO1xuXHR2YXIgdmlldyA9IG5ldyBEYXRhVmlldyhidWZmZXIpO1xuXG5cdC8qIFJJRkYgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAwLCAnUklGRicpO1xuXHQvKiBSSUZGIGNodW5rIGxlbmd0aCAqL1xuXHR2aWV3LnNldFVpbnQzMig0LCAzNiArIHNhbXBsZXMubGVuZ3RoICogMiwgdHJ1ZSk7XG5cdC8qIFJJRkYgdHlwZSAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCA4LCAnV0FWRScpO1xuXHQvKiBmb3JtYXQgY2h1bmsgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAxMiwgJ2ZtdCAnKTtcblx0LyogZm9ybWF0IGNodW5rIGxlbmd0aCAqL1xuXHR2aWV3LnNldFVpbnQzMigxNiwgMTYsIHRydWUpO1xuXHQvKiBzYW1wbGUgZm9ybWF0IChyYXcpICovXG5cdHZpZXcuc2V0VWludDE2KDIwLCAxLCB0cnVlKTtcblx0LyogY2hhbm5lbCBjb3VudCAqL1xuXHR2aWV3LnNldFVpbnQxNigyMiwgbnVtQ2hhbm5lbHMsIHRydWUpO1xuXHQvKiBzYW1wbGUgcmF0ZSAqL1xuXHR2aWV3LnNldFVpbnQzMigyNCwgc2FtcGxlUmF0ZSwgdHJ1ZSk7XG5cdC8qIGJ5dGUgcmF0ZSAoc2FtcGxlIHJhdGUgKiBibG9jayBhbGlnbikgKi9cblx0dmlldy5zZXRVaW50MzIoMjgsIHNhbXBsZVJhdGUgKiA0LCB0cnVlKTtcblx0LyogYmxvY2sgYWxpZ24gKGNoYW5uZWwgY291bnQgKiBieXRlcyBwZXIgc2FtcGxlKSAqL1xuXHR2aWV3LnNldFVpbnQxNigzMiwgbnVtQ2hhbm5lbHMgKiAyLCB0cnVlKTtcblx0LyogYml0cyBwZXIgc2FtcGxlICovXG5cdHZpZXcuc2V0VWludDE2KDM0LCAxNiwgdHJ1ZSk7XG5cdC8qIGRhdGEgY2h1bmsgaWRlbnRpZmllciAqL1xuXHR3cml0ZVN0cmluZyh2aWV3LCAzNiwgJ2RhdGEnKTtcblx0LyogZGF0YSBjaHVuayBsZW5ndGggKi9cblx0dmlldy5zZXRVaW50MzIoNDAsIHNhbXBsZXMubGVuZ3RoICogMiwgdHJ1ZSk7XG5cblx0ZmxvYXRUbzE2Qml0UENNKHZpZXcsIDQ0LCBzYW1wbGVzKTtcblxuXHRyZXR1cm4gdmlldztcbn0iLCJ2YXIgY29udHJvbHMgPSB7XG5cdHNvdXJjZTogdW5kZWZpbmVkLFxuXHRkdXJhdGlvbjogdW5kZWZpbmVkLFxufTtcblxudmFyIGNvbnRyb2xFbGVtZW50cyA9IHtcblx0c291cmNlOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXVkaW8tc291cmNlJyksXG5cdGR1cmF0aW9uOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXVkaW8tZHVyYXRpb24nKSxcblx0c2F2ZTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F1ZGlvLXNhdmUnKSxcbn1cblxucG9wdWxhdGVBdWRpb1NvdXJjZXMgPSBmdW5jdGlvbigpIHtcblx0bmF2aWdhdG9yLm1lZGlhRGV2aWNlcy5lbnVtZXJhdGVEZXZpY2VzKClcblx0XHQudGhlbihmdW5jdGlvbihkZXZpY2VzKSB7XG5cdFx0XHQvLyBGaWx0ZXIgdG8gdmFsaWQgZGV2aWNlc1xuXHRcdFx0dmFyIGF1ZGlvRGV2aWNlcyA9IGRldmljZXMuZmlsdGVyKGZ1bmN0aW9uKGRldmljZSkge1xuXHRcdFx0XHRyZXR1cm4gZGV2aWNlLmtpbmQgPT0gJ2F1ZGlvaW5wdXQnO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFJlLXBvcHVsYXRlIHRoZSBzb3VyY2Ugc2VsZWN0b3Igb3B0aW9uc1xuXHRcdFx0cmVtb3ZlQWxsQ2hpbGRyZW4oY29udHJvbEVsZW1lbnRzLnNvdXJjZSk7XG5cblx0XHRcdGF1ZGlvRGV2aWNlcy5mb3JFYWNoKGZ1bmN0aW9uKGRldmljZSkge1xuXHRcdFx0XHQvLyBDcmVhdGUgYW4gPG9wdGlvbj5cblx0XHRcdFx0dmFyIGRldmljZU9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xuXHRcdFx0XHRkZXZpY2VPcHRpb24udmFsdWUgPSBkZXZpY2UuZGV2aWNlSWQ7XG5cdFx0XHRcdGRldmljZU9wdGlvbi50ZXh0Q29udGVudCA9IChkZXZpY2UubGFiZWwgPyBkZXZpY2UubGFiZWwgOiBkZXZpY2UuZGV2aWNlSWQpO1xuXG5cdFx0XHRcdGNvbnRyb2xFbGVtZW50cy5zb3VyY2UuYXBwZW5kQ2hpbGQoZGV2aWNlT3B0aW9uKTtcblxuXHRcdFx0XHRpZihkZXZpY2UuZGV2aWNlSWQgPT0gY29udHJvbHMuc291cmNlKSB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBpcyB0aGUgYWN0aXZlIHNvdXJjZSBzbyBtYWtlIHN1cmUgdGhlIHNlbGVjdG9yIG1hdGNoZXNcblx0XHRcdFx0XHRjb250cm9sRWxlbWVudHMuc291cmNlLnZhbHVlID0gZGV2aWNlT3B0aW9uLnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBhIGNoYW5nZSBldmVudCBzbyB0aGUgYWN0aXZlIHNvdXJjZSBtYXRjaGVzIHRoZSBzZWxlY3RvclxuXHRcdFx0Y29udHJvbEVsZW1lbnRzLnNvdXJjZS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJykpO1xuXHRcdH0pXG5cdFx0LmNhdGNoKGZ1bmN0aW9uKGVycm9yKSB7XG5cdFx0XHRhbGVydCgnVW5hYmxlIHRvIGZldGNoIGF1ZGlvIGRldmljZXMnKTtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ1VuYWJsZWQgdG8gZmV0Y2ggYXVkaW8gZGV2aWNlcycsIGVycm9yKTtcblx0XHR9KVxufSgpO1xuXG5jb250cm9sRWxlbWVudHMuc291cmNlLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGNoYW5nZUF1ZGlvU291cmNlID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0dmFyIGNob3NlblNvdXJjZSA9IGNvbnRyb2xFbGVtZW50cy5zb3VyY2UudmFsdWU7XG5cblx0aWYoY2hvc2VuU291cmNlICE9IGNvbnRyb2xzLnNvdXJjZSkge1xuXHRcdC8vIERpZmZlcmVudCBzb3VyY2UgaGFzIGJlZW4gY2hvc2VuLCB0cmlnZ2VyIHVwZGF0ZXNcblx0XHRjb250cm9scy5zb3VyY2UgPSBjaG9zZW5Tb3VyY2U7XG5cblx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbnRyb2xzLnNvdXJjZS5jaGFuZ2UnKSk7XG5cdH1cbn0pO1xuXG52YXIgX2R1cmF0aW9uQ2hhbmdlVGltZW91dCA9IHVuZGVmaW5lZDtcbmNoYW5nZUF1ZGlvRHVyYXRpb24gPSBmdW5jdGlvbihldmVudCkge1xuXHQvLyBfZHVyYXRpb25DaGFuZ2VUaW1lb3V0IGlzIGEgZ2xvYmFsIHRoYXQncyBlZmZlY3RpdmVseSBkZWJvdW5jaW5nIHRoaXMgZnVuY3Rpb25cblx0aWYoX2R1cmF0aW9uQ2hhbmdlVGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y2xlYXJUaW1lb3V0KF9kdXJhdGlvbkNoYW5nZVRpbWVvdXQpO1xuXHR9XG5cblx0X2R1cmF0aW9uQ2hhbmdlVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0X2R1cmF0aW9uQ2hhbmdlVGltZW91dCA9IHVuZGVmaW5lZDtcblxuXHRcdHZhciBjaG9zZW5EdXJhdGlvbiA9IGNvbnRyb2xFbGVtZW50cy5kdXJhdGlvbi52YWx1ZTtcblxuXHRcdGlmKGNob3NlbkR1cmF0aW9uICE9IGNvbnRyb2xzLmR1cmF0aW9uKSB7XG5cdFx0XHQvLyBEaWZmZXJlbnQgZHVyYXRpb24gaGFzIGJlZW4gZW50ZXJlZCwgdHJpZ2dlciB1cGRhdGVzXG5cdFx0XHRjb250cm9scy5kdXJhdGlvbiA9IGNob3NlbkR1cmF0aW9uO1xuXG5cdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbnRyb2xzLmR1cmF0aW9uLmNoYW5nZScpKTtcblx0XHR9XG5cdH0sIDUwMCk7XG59KCk7XG5jb250cm9sRWxlbWVudHMuZHVyYXRpb24uYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBjaGFuZ2VBdWRpb0R1cmF0aW9uKTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2F1ZGlvLnJlY29yZGVyLnN0YXJ0JywgZW5hYmxlU2F2ZUF1ZGlvID0gZnVuY3Rpb24oKSB7XG5cdGNvbnRyb2xFbGVtZW50cy5zYXZlLmRpc2FibGVkID0gZmFsc2U7XG59KTtcblxuY29udHJvbEVsZW1lbnRzLnNhdmUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGlja1NhdmVBdWRpbyA9IGZ1bmN0aW9uKCkge1xuXHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbnRyb2xzLnNhdmUnKSk7XG59KTsiXX0=
