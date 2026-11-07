<?php
  require_once 'config/config.php';
  $appName = $appPublicName ?? 'ASTEROIDS';
  $appDescription = 'Play '.$appName.' online for free in your browser. Faithful remake of the 1979 Atari vector arcade game with no download required.';
  $appPrefix = 'as';
  $appNoscript =
    '<h1>'.$appName.'</h1>'.
    '<p>Asteroids is the 1979 arcade game by Atari, drawn on a vector monitor: '.
    'a lone ship in a field of drifting rocks, with flying saucers that shoot back, '.
    'a thrust that keeps you moving and a hyperspace button for emergencies.</p>'.
    '<p>This is a faithful remake that runs directly in your web browser. '.
    'There is nothing to install and nothing to download — just open the page and play. '.
    'Please enable JavaScript to start the game.</p>'.
    '<p><a href="about">More about Asteroids and this remake</a></p>';
  $appOpenGraph = [
    'image' => 'images/app-icon-512x512.png',
  ];
  $appJsonLd = [
    'genre' => 'Shoot \'em up',
    'isBasedOn' => [
      '@type' => 'VideoGame',
      'name' => 'Asteroids',
      'author' => [
        ['@type' => 'Person', 'name' => 'Lyle Rains'],
        ['@type' => 'Person', 'name' => 'Ed Logg'],
      ],
      'publisher' => [
        ['@type' => 'Organization', 'name' => 'Atari'],
      ],
      'datePublished' => '1979',
      'gamePlatform' => 'Arcade',
    ],
  ];
  require_once 'app/svision/php/main.php';
