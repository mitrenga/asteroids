<?php

require_once 'app/svision/php/abstractAboutPage.php';

/**
 * The /about page: the story of the original Asteroids and this remake.
 * Skeleton text (AS-M2); the credits and the links are AS-M9.
 */
class AboutPage extends AbstractAboutPage {

  protected function aboutData() {
    return [
      'image' => 'images/app-icon-512x512.png',
      'sections' => [
        [
          'heading' => 'The original game (1979)',
          'html' =>
            '<p>Asteroids was released by Atari in 1979, designed by Lyle Rains and Ed Logg. It was drawn '.
            'on a black and white vector monitor by Atari\'s Digital Vector Generator: a ship that turns, '.
            'thrusts and drifts with inertia in a field of rocks that break into smaller ones, large and '.
            'small flying saucers that shoot at the player, and a hyperspace button that throws the ship '.
            'somewhere else on the screen — at a risk. It became one of the best-selling arcade games ever.</p>',
        ],
        [
          'heading' => 'This remake',
          'html' =>
            '<p>This remake draws the same vector shapes as the original, with the same geometry, in your '.
            'web browser. There is nothing to install and nothing to download — just open the page and '.
            'play, free of charge. The game supports keyboard, touch controls and gamepads.</p>'.$this->installNote(),
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
      'footer' =>
        '<p>An unofficial fan remake. The original game and its artwork belong to their authors (Atari). '.
        'The remake\'s source code is licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>.</p>',
    ];
  } // aboutData

} // AboutPage
