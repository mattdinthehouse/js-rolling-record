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