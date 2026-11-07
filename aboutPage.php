<?php

require_once 'app/svision/php/abstractAboutPage.php';

/**
 * The /about page: the story of the original Asteroids and of this remake,
 * with links to Wikipedia, the Arcade Museum and the original's sources.
 * The cover is the poster scaled down (images/README.md); the footer names
 * the licence of the remake (CC BY-NC-SA 4.0) and links the GitHub
 * repository. The project is a work in progress (2026-11).
 */
class AboutPage extends AbstractAboutPage {

  protected function aboutData() {
    return [
      'description' =>
        'Asteroids (Atari, 1979) rebuilt for the browser on the svision library — the rocks, the saucers, '.
        'the ship and the sound of the arcade cabinet, drawn and played by the routines of the original '.
        'program. An unofficial, non-commercial fan remake.',
      'image' => 'images/cover.png',
      'sections' => [
        [
          'heading' => 'The original game (1979)',
          'html' =>
            '<p>Asteroids was released by Atari in November 1979, designed by Lyle Rains and Ed Logg. '.
            'It was drawn on a black and white vector monitor by Atari\'s Digital Vector Generator: a '.
            'lone ship that turns, thrusts and drifts with inertia in a field of rocks that break into '.
            'smaller and faster ones, a large saucer that fires at random and a small one that aims, and '.
            'a hyperspace button that throws the ship somewhere else on the screen — at a risk. The sound '.
            'came from discrete circuits on the board, the heartbeat that quickens as the field thins '.
            'among them. It became Atari\'s best-selling coin-op and one of the most played arcade games '.
            'ever.</p>',
        ],
        [
          'heading' => 'This remake',
          'html' =>
            '<p>This is a faithful remake of the arcade game, rewritten for the web browser rather than '.
            'emulated. The shapes of the rocks, the saucers, the ship and the font are the original\'s own '.
            'vector data drawn through a model of the vector generator, and the game itself is the '.
            'original program ported routine by routine: the same waves, the same speeds, the same '.
            'saucer, the same end of the game with the initials and the high score table. The sound is '.
            'the board\'s circuits modelled one by one.</p>'.
            '<p>It runs directly in your web browser — there is nothing to install and nothing to '.
            'download, just open the page and play, free of charge. The game supports keyboard, touch '.
            'controls and gamepads. The remake is still a work in progress: the settings and the '.
            'installable version are yet to come.</p>'.$this->installNote(),
        ],
        [
          'heading' => 'Other games',
          'html' =>
            '<p>This remake is one of a growing collection of classic games from the 8-bit and 16-bit era '.
            '— ZX Spectrum, Commodore 64, arcade and more — rebuilt faithfully on the same library and '.
            'playable in your browser, free of charge. Browse the whole collection at '.
            '<a href="https://retrogames.free/" target="_blank" rel="noopener">retrogames.free</a>.</p>',
        ],
      ],
      'links' => [
        ['label' => 'Asteroids on Wikipedia', 'url' => 'https://en.wikipedia.org/wiki/Asteroids_(video_game)'],
        ['label' => 'Asteroids at the Arcade Museum', 'url' => 'https://www.arcade-museum.com/Videogame/asteroids'],
        ['label' => 'The original source code (Atari, 1979)', 'url' => 'https://github.com/historicalsource/asteroids'],
        ['label' => 'Ed Logg on Wikipedia', 'url' => 'https://en.wikipedia.org/wiki/Ed_Logg'],
      ],
      'footer' =>
        '<p>An unofficial fan remake, made as a study of the original program. Asteroids and its artwork '.
        'belong to their authors and rights holders — &copy; Atari, Inc. 1979. This remake is free of '.
        'charge and not for sale. '.
        'Remake source code is available on <a href="https://github.com/mitrenga/asteroids" target="_blank" rel="noopener">GitHub</a> '.
        'under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>.</p>',
    ];
  } // aboutData

} // AboutPage
