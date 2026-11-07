<?php

/**
 * appData.db — everything the application loads at start: the JSON files of
 * data/ and the current high score. The database is optional while the game
 * is a skeleton (AS-M2): without a reachable one the high score is 0 and the
 * menu still comes up. With one, the high score and the ten best entries
 * (one per name) come along: the game's high score table (AS-M6) starts
 * from them, padded with the machine's power-on list.
 *
 * Only data/global.json exists in the skeleton; shapes, font and tables
 * (tools/rom2vectors.mjs, rom2tables.mjs) come with AS-M3. A file that is
 * not there yet is left out of the answer, not reported as an error.
 */
class DataCommand {

  var $files = ['global', 'shapes', 'font', 'tables'];

  public function execute($postData) {
    $result = [];
    foreach ($this->files as $file) {
      $path = 'data/'.$file.'.json';
      if (!file_exists($path)) {
        continue;
      }
      $dataJSON = file_get_contents($path);
      try {
        $result[$file] = json_decode($dataJSON);
      }
      catch (\JsonException $exception) {
        $result[$file] = ['error' => ['message' => $exception->getMessage()]];
      }
    }

    $result['hiScore'] = 0;
    $result['hallOfFame'] = [];
    if (!class_exists('mysqli')) {
      return $result;
    }
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = @new mysqli($GLOBALS['dbHostname'], $GLOBALS['dbUser'], $GLOBALS['dbPassword'], $GLOBALS['dbName']);
    if (!$mysqli->connect_errno) {
      $data = $mysqli->query('SELECT `name`, MAX(`score`) as score FROM `rg_as_hallOfFame` GROUP BY `name` ORDER BY score DESC LIMIT 10');
      if ($data) {
        while ($row = $data->fetch_object()) {
          $result['hallOfFame'][] = ['name' => $row->name, 'score' => (int) $row->score];
        }
      }
      if (count($result['hallOfFame'])) {
        $result['hiScore'] = $result['hallOfFame'][0]['score'];
      }
      $mysqli->close();
    }

    return $result;
  } // execute

} // class DataCommand
