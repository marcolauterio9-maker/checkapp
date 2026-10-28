<?php
/**
 * Local XAMPP defaults. Production values belong in config.local.php or
 * environment variables; both configuration files are blocked by .htaccess.
 */

$environment = getenv('TAROT_ENV');
$serverName = strtolower($_SERVER['SERVER_NAME'] ?? '');
$isLocalServer = in_array($serverName, ['localhost', '127.0.0.1', '::1'], true);
if ($environment !== false && !in_array($environment, ['local', 'production'], true)) {
    throw new RuntimeException('TAROT_ENV must be either local or production.');
}
if ($environment === 'local' && !$isLocalServer) {
    throw new RuntimeException('Local development mode is only allowed on localhost.');
}
$isProduction = $environment === 'production' || !$isLocalServer;

$config = [
    'host' => '127.0.0.1',
    'port' => '3306',
    'database' => 'tarot_agenda',
    'username' => 'root',
    'password' => '',
    'initial_admin_pin' => '',
    'admin_email' => 'paulinaescalante.puraluz@gmail.com',
    'smtp_host' => 'smtp.gmail.com',
    'smtp_port' => '587',
    'smtp_username' => 'paulinaescalante.puraluz@gmail.com',
    'smtp_password' => ''
];

$privateConfigFile = __DIR__ . '/config.local.php';
if (is_file($privateConfigFile)) {
    if (!is_readable($privateConfigFile)) {
        throw new RuntimeException('The private application configuration is not readable.');
    }
    $privateConfig = require $privateConfigFile;
    if (!is_array($privateConfig)) {
        throw new RuntimeException('The private application configuration must return an array.');
    }
    $config = array_replace($config, $privateConfig);
}

$environmentKeys = [
    'host' => 'TAROT_DB_HOST',
    'port' => 'TAROT_DB_PORT',
    'database' => 'TAROT_DB_NAME',
    'username' => 'TAROT_DB_USER',
    'password' => 'TAROT_DB_PASSWORD',
    'initial_admin_pin' => 'TAROT_ADMIN_PIN',
    'admin_email' => 'TAROT_ADMIN_EMAIL',
    'smtp_host' => 'TAROT_SMTP_HOST',
    'smtp_port' => 'TAROT_SMTP_PORT',
    'smtp_username' => 'TAROT_SMTP_USER',
    'smtp_password' => 'TAROT_SMTP_PASSWORD'
];
foreach ($environmentKeys as $key => $environmentKey) {
    $value = getenv($environmentKey);
    if ($value !== false) {
        $config[$key] = $value;
    }
}
if (
    getenv('TAROT_SMTP_USER') === false
    && (getenv('TAROT_ADMIN_EMAIL') !== false || !isset($privateConfig['smtp_username']))
) {
    $config['smtp_username'] = getenv('TAROT_ADMIN_EMAIL');
    if ($config['smtp_username'] === false) {
        $config['smtp_username'] = $config['admin_email'];
    }
}

if ($isProduction) {
    foreach (['host', 'port', 'database', 'username', 'password', 'initial_admin_pin'] as $key) {
        if (!is_string($config[$key]) || $config[$key] === '') {
            throw new RuntimeException('Production configuration is missing a required database or administrator setting.');
        }
    }
    if (
        $config['username'] === 'root'
        || !preg_match('/^[A-Za-z0-9.-]+$/', $config['host'])
        || !preg_match('/^[A-Za-z0-9_]+$/', $config['database'])
        || !ctype_digit((string) $config['port'])
        || (int) $config['port'] < 1
        || (int) $config['port'] > 65535
    ) {
        throw new RuntimeException('Production database settings are invalid; use the dedicated MySQL account from your hosting panel.');
    }

    $pin = (string) $config['initial_admin_pin'];
    $digits = array_map('intval', str_split($pin));
    if (
        !preg_match('/^\d{6}$/', $pin)
        || $pin === '123456'
        || count(array_unique($digits)) === 1
        || $digits === range((int) $pin[0], (int) $pin[0] + 5)
        || $digits === range((int) $pin[0], (int) $pin[0] - 5, -1)
    ) {
        throw new RuntimeException('Production requires a non-sequential, non-repeating six-digit TAROT_ADMIN_PIN.');
    }
}

return $config;
