function UNIQUE_ID(cell1, cell2, cell3, length = 8) {
  try {
    var content = [cell1, cell2, cell3].map(function(cell) {
      return cell ? cell.toString() : "";
    }).join('');

    var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, content);
    var id = hash.map(function(byte) {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');

    return id.substring(0, length);
  } catch (error) {
    Logger.log('An error occurred: ' + error.message);
    Logger.log('Input values were: cell1 = ' + cell1 + ', cell2 = ' + cell2 + ', cell3 = ' + cell3);
    // Return a recognizable value for manual investigation.
    return 'ERROR';
  }
}