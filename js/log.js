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