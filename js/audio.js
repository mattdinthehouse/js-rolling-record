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