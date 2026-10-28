<?php
/**
 * MySQL/MariaDB API for the Tarot booking application.
 * The existing JSON data file is imported automatically the first time the
 * database is used; all subsequent reads and writes use MySQL.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Strict',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'
]);
session_start();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

function respond($statusCode, $payload) {
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function getPdo() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $config = require __DIR__ . '/config.php';
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $config['host'],
        $config['port'],
        $config['database']
    );
    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS app_state (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            payload JSON NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS admin_recovery (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            code_hash VARCHAR(255) NOT NULL,
            expires_at DATETIME NOT NULL,
            attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
            requested_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS admin_login_attempts (
            ip_hash CHAR(64) NOT NULL PRIMARY KEY,
            attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
            window_started DATETIME NOT NULL,
            locked_until DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    return $pdo;
}

function initializeState(PDO $pdo) {
    $query = $pdo->query('SELECT id FROM app_state WHERE id = 1');
    if ($query->fetch()) {
        return;
    }

    $dataFile = __DIR__ . '/data/db.json';
    if (!is_file($dataFile) || !is_readable($dataFile)) {
        throw new RuntimeException('Initial application data file is missing or unreadable.');
    }

    $data = json_decode(file_get_contents($dataFile), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($data)) {
        throw new RuntimeException('Initial application data is invalid.');
    }
    $config = require __DIR__ . '/config.php';
    unset($data['business']['adminPin']);
    if (isStrongAdminPin($config['initial_admin_pin'])) {
        $data['business']['adminPin'] = password_hash($config['initial_admin_pin'], PASSWORD_DEFAULT);
    }

    $insert = $pdo->prepare('INSERT IGNORE INTO app_state (id, payload) VALUES (1, :payload)');
    $insert->execute([
        'payload' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)
    ]);
}

function loadState(PDO $pdo, $lock = false) {
    initializeState($pdo);
    $statement = $pdo->query(
        'SELECT payload FROM app_state WHERE id = 1' . ($lock ? ' FOR UPDATE' : '')
    );
    $row = $statement->fetch();
    if (!$row) {
        throw new RuntimeException('Application data could not be initialized.');
    }

    $data = json_decode($row['payload'], true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($data)) {
        throw new RuntimeException('Stored application data is invalid.');
    }
    if (($data['business']['name'] ?? null) === 'Tarot & Oráculos Místicos') {
        $data['business']['name'] = 'Pura Luz';
        $changed = true;
    } else {
        $changed = false;
    }
    if (($data['business']['phone'] ?? null) === '+526624511670') {
        $data['business']['phone'] = '+526621969016';
        $changed = true;
    }
    if (($data['business']['whatsapp'] ?? null) === '526624511670') {
        $data['business']['whatsapp'] = '526621969016';
        $changed = true;
    }
    if (($data['business']['avatarUrl'] ?? null) === 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80') {
        $data['business']['avatarUrl'] = 'images/pura-luz-logo.png';
        $changed = true;
    }
    foreach ($data['specialists'] ?? [] as &$specialist) {
        if (($specialist['phone'] ?? null) === '526624511670') {
            $specialist['phone'] = '526621969016';
            $changed = true;
        }
    }
    unset($specialist);
    if ($changed) {
        storeState($pdo, $data);
    }
    return $data;
}

function storeState(PDO $pdo, array $data) {
    $statement = $pdo->prepare('UPDATE app_state SET payload = :payload WHERE id = 1');
    $statement->execute([
        'payload' => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)
    ]);
}

function updateState(PDO $pdo, callable $callback) {
    $pdo->beginTransaction();
    try {
        $data = loadState($pdo, true);
        $response = $callback($data);
        storeState($pdo, $data);
        $pdo->commit();
        return $response;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function requireAdminSession() {
    if (empty($_SESSION['admin_authenticated'])) {
        respond(401, ['status' => 'error', 'message' => 'Inicia sesión como administrador para continuar.']);
        exit();
    }
}

function publicState(array $data) {
    unset($data['business']['adminPin']);
    $availabilityFields = [
        'specialistId', 'date', 'time', 'endDate', 'endTime',
        'timeZone', 'startAt', 'endAt', 'durationMins', 'status'
    ];
    $data['appointments'] = array_map(function ($appointment) use ($availabilityFields) {
        return array_intersect_key($appointment, array_flip($availabilityFields));
    }, $data['appointments'] ?? []);
    return $data;
}

function getClientIpHash() {
    $ipAddress = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return hash('sha256', $ipAddress);
}

function pinIsHashed($pin) {
    return password_get_info($pin)['algo'] !== null;
}

function isStrongAdminPin($pin) {
    $pin = (string) $pin;
    if (!preg_match('/^\d{6}$/', (string) $pin) || $pin === '123456') {
        return false;
    }
    if (preg_match('/^(\d)\1{5}$/', $pin)) {
        return false;
    }
    $digits = array_map('intval', str_split($pin));
    $ascending = $digits === range($digits[0], $digits[0] + 5);
    $descending = $digits === range($digits[0], $digits[0] - 5, -1);
    return !$ascending && !$descending;
}

function sendSmtpMessage(array $config, $recipient, $subject, $body) {
    if (empty($config['smtp_username']) || empty($config['smtp_password'])) {
        throw new RuntimeException('Configura TAROT_SMTP_USER y TAROT_SMTP_PASSWORD para habilitar la recuperación por correo.');
    }

    $host = $config['smtp_host'];
    $port = (int) $config['smtp_port'];
    $context = stream_context_create([
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host]
    ]);
    $socket = stream_socket_client(
        'tcp://' . $host . ':' . $port,
        $errorCode,
        $errorMessage,
        15,
        STREAM_CLIENT_CONNECT,
        $context
    );
    if (!$socket) {
        throw new RuntimeException('No fue posible conectar con el servidor SMTP: ' . $errorMessage);
    }
    stream_set_timeout($socket, 15);

    $readResponse = function ($expected) use ($socket) {
        $response = '';
        do {
            $line = fgets($socket, 515);
            if ($line === false) {
                throw new RuntimeException('El servidor SMTP cerró la conexión inesperadamente.');
            }
            $response .= $line;
        } while (isset($line[3]) && $line[3] === '-');

        if (!preg_match('/^' . $expected . '/', $response)) {
            throw new RuntimeException('El servidor SMTP rechazó una operación: ' . trim($response));
        }
        return $response;
    };
    $sendCommand = function ($command, $expected) use ($socket, $readResponse) {
        if (fwrite($socket, $command . "\r\n") === false) {
            throw new RuntimeException('No se pudo enviar el comando al servidor SMTP.');
        }
        return $readResponse($expected);
    };

    try {
        $readResponse(220);
        $sendCommand('EHLO localhost', 250);
        $sendCommand('STARTTLS', 220);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('No se pudo establecer TLS con el servidor SMTP.');
        }
        $sendCommand('EHLO localhost', 250);
        $sendCommand('AUTH LOGIN', 334);
        $sendCommand(base64_encode($config['smtp_username']), 334);
        $sendCommand(base64_encode($config['smtp_password']), 235);
        $sendCommand('MAIL FROM:<' . $config['smtp_username'] . '>', 250);
        $sendCommand('RCPT TO:<' . $recipient . '>', 250);
        $sendCommand('DATA', 354);

        $message = 'From: Tarot Admin <' . $config['smtp_username'] . ">\r\n"
            . 'To: ' . $recipient . "\r\n"
            . 'Subject: =?UTF-8?B?' . base64_encode($subject) . "?=\r\n"
            . "MIME-Version: 1.0\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: 8bit\r\n\r\n"
            . $body;
        $message = preg_replace('/(?m)^\./', '..', $message);
        if (fwrite($socket, $message . "\r\n.\r\n") === false) {
            throw new RuntimeException('No se pudo enviar el correo de recuperación.');
        }
        $readResponse(250);
        $sendCommand('QUIT', 221);
    } finally {
        fclose($socket);
    }
}

function readInput() {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        respond(400, ['status' => 'error', 'message' => 'Invalid JSON request body.']);
        return null;
    }
    return $input;
}

function requireFields(array $input, array $fields) {
    foreach ($fields as $field) {
        if (!isset($input[$field]) || $input[$field] === '') {
            respond(400, ['status' => 'error', 'message' => 'Missing required field: ' . $field]);
            return false;
        }
    }
    return true;
}

function parseAppointmentDateTime(array $appointment, $useEnd = false) {
    $timestampKey = $useEnd ? 'endAt' : 'startAt';
    if (!empty($appointment[$timestampKey])) {
        try {
            return new DateTimeImmutable($appointment[$timestampKey]);
        } catch (Throwable $error) {
            return null;
        }
    }

    $dateKey = $useEnd ? 'endDate' : 'date';
    $timeKey = $useEnd ? 'endTime' : 'time';
    if (empty($appointment[$dateKey]) || empty($appointment[$timeKey])) {
        return null;
    }
    try {
        $timeZone = new DateTimeZone($appointment['timeZone'] ?? 'UTC');
        return new DateTimeImmutable($appointment[$dateKey] . ' ' . $appointment[$timeKey], $timeZone);
    } catch (Throwable $error) {
        return null;
    }
}

function appointmentScheduleError(array $appointment, array $data, DateTimeImmutable $start, DateTimeImmutable $end) {
    $timeZoneName = $data['business']['timeZone'] ?? 'UTC';
    try {
        $timeZone = new DateTimeZone($timeZoneName);
    } catch (Throwable $error) {
        return 'La zona horaria del negocio no es válida; no se pueden aceptar reservas.';
    }

    $localStart = $start->setTimezone($timeZone);
    $localEnd = $end->setTimezone($timeZone);
    $date = $localStart->format('Y-m-d');
    if (($appointment['date'] ?? '') !== $date || ($appointment['time'] ?? '') !== $localStart->format('H:i')
        || $localEnd->format('Y-m-d') !== $date) {
        return 'El horario seleccionado cambió. Actualiza la página y elige nuevamente.';
    }

    $bookingWindow = $data['schedule']['bookingWindow'] ?? [];
    if ((!empty($bookingWindow['startDate']) && $date < $bookingWindow['startDate'])
        || (!empty($bookingWindow['endDate']) && $date > $bookingWindow['endDate'])) {
        return 'La fecha seleccionada está fuera del período permitido para reservar.';
    }
    foreach ($data['schedule']['timeOff'] ?? [] as $period) {
        if (($period['startDate'] ?? '') <= $date && $date <= ($period['endDate'] ?? '')) {
            return 'La fecha seleccionada está bloqueada por un período sin atención.';
        }
    }

    $dayOfWeek = (int) $localStart->format('w');
    $businessDay = $data['schedule'][(string) $dayOfWeek] ?? null;
    if (!is_array($businessDay)) return 'No hay atención configurada para ese día.';

    $specialistId = (string) ($appointment['specialistId'] ?? '');
    $schedule = $businessDay;
    if ($specialistId === 'any') {
        if (empty($businessDay['active'])) return 'No hay atención configurada para ese día.';
        $hasAvailableSpecialist = false;
        foreach ($data['specialists'] ?? [] as $specialist) {
            if (($specialist['id'] ?? '') === 'any' || ($specialist['active'] ?? true) === false) continue;
            if (isset($specialist['workDays']) && !in_array($dayOfWeek, $specialist['workDays'], true)) continue;
            if (in_array($date, $specialist['blockedDates'] ?? [], true)) continue;
            $hasAvailableSpecialist = true;
            break;
        }
        if (!$hasAvailableSpecialist) return 'No hay especialistas disponibles para ese día.';
    } else {
        $specialist = null;
        foreach ($data['specialists'] ?? [] as $candidate) {
            if (($candidate['id'] ?? '') === $specialistId) {
                $specialist = $candidate;
                break;
            }
        }
        if (!$specialist || ($specialist['active'] ?? true) === false) {
            return 'El especialista seleccionado ya no está disponible.';
        }
        if (isset($specialist['workDays']) && !in_array($dayOfWeek, $specialist['workDays'], true)) {
            return 'El especialista no trabaja ese día.';
        }
        if (in_array($date, $specialist['blockedDates'] ?? [], true)) {
            return 'El especialista no está disponible en esa fecha.';
        }
        if (isset($specialist['workHours'][(string) $dayOfWeek])) {
            $schedule = $specialist['workHours'][(string) $dayOfWeek];
        }
    }

    if (empty($schedule['active'])) return 'No hay atención configurada para ese día.';
    $open = $schedule['open'] ?? '';
    $close = $schedule['close'] ?? '';
    $startTime = $localStart->format('H:i');
    $endTime = $localEnd->format('H:i');
    if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $open)
        || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $close)
        || $startTime < $open || $endTime > $close) {
        return 'La cita queda fuera del horario de atención configurado.';
    }

    $lunchStart = $businessDay['lunchStart'] ?? '';
    $lunchEnd = $businessDay['lunchEnd'] ?? '';
    if ($lunchStart !== '' && $lunchEnd !== '' && $startTime < $lunchEnd && $endTime > $lunchStart) {
        return 'La cita se empalma con el horario de comida.';
    }
    return null;
}

function getAppointmentDuration(array $appointment, array $services = []) {
    $duration = (int) ($appointment['durationMins'] ?? 0);
    if ($duration > 0) return $duration;

    $duration = 0;
    foreach ($appointment['services'] ?? [] as $bookedService) {
        foreach ($services as $service) {
            if (($service['id'] ?? null) === ($bookedService['id'] ?? null)) {
                $duration += (int) ($service['duration'] ?? 0);
                break;
            }
        }
    }
    return $duration > 0 ? $duration : 60;
}

function appointmentsOverlap(array $first, array $second, array $services = []) {
    $firstStart = parseAppointmentDateTime($first);
    $secondStart = parseAppointmentDateTime($second);
    if (!$firstStart || !$secondStart) return false;

    $firstEnd = parseAppointmentDateTime($first, true);
    if (!$firstEnd) {
        $firstEnd = $firstStart->modify('+' . getAppointmentDuration($first, $services) . ' minutes');
    }
    $secondEnd = parseAppointmentDateTime($second, true);
    if (!$secondEnd) {
        $secondEnd = $secondStart->modify('+' . getAppointmentDuration($second, $services) . ' minutes');
    }
    return $firstStart < $secondEnd && $firstEnd > $secondStart;
}

function persistAppointment(PDO $pdo, array $input, $createdByAdmin = false) {
    return updateState($pdo, function (&$data) use ($input, $createdByAdmin) {
        if (!isset($data['appointments'])) $data['appointments'] = [];

        if ($createdByAdmin) {
            $timeZoneName = $data['business']['timeZone'] ?? 'UTC';
            try {
                $timeZone = new DateTimeZone($timeZoneName);
                $start = new DateTimeImmutable($input['date'] . ' ' . $input['time'], $timeZone);
            } catch (Throwable $error) {
                return ['error' => 'La fecha, hora o zona horaria no son válidas.', 'code' => 'APPOINTMENT_UNAVAILABLE'];
            }
            if ($start->format('Y-m-d H:i') !== $input['date'] . ' ' . $input['time']) {
                return ['error' => 'La fecha u hora de la cita no son válidas.', 'code' => 'APPOINTMENT_UNAVAILABLE'];
            }
            $duration = (int) ($input['durationMins'] ?? 0);
            if ($duration < 1) {
                return ['error' => 'La duración de la cita no es válida.', 'code' => 'APPOINTMENT_UNAVAILABLE'];
            }
            $end = $start->modify('+' . $duration . ' minutes');
            $input['timeZone'] = $timeZoneName;
            $input['startAt'] = $start->format(DateTimeInterface::ATOM);
            $input['endAt'] = $end->format(DateTimeInterface::ATOM);
            $input['endDate'] = $end->format('Y-m-d');
            $input['endTime'] = $end->format('H:i');
        } else {
            try {
                $start = new DateTimeImmutable($input['startAt']);
                $end = new DateTimeImmutable($input['endAt']);
            } catch (Throwable $error) {
                return ['error' => 'El horario seleccionado no es válido.', 'code' => 'APPOINTMENT_UNAVAILABLE'];
            }
            $duration = (int) ($input['durationMins'] ?? 0);
            if ($end <= $start || $duration < 1 || $end->getTimestamp() - $start->getTimestamp() !== $duration * 60) {
                return ['error' => 'La duración de la cita no es válida.', 'code' => 'APPOINTMENT_UNAVAILABLE'];
            }
        }

        $scheduleError = appointmentScheduleError($input, $data, $start, $end);
        if ($scheduleError !== null) {
            return ['error' => $scheduleError, 'code' => 'APPOINTMENT_UNAVAILABLE'];
        }
        foreach ($data['appointments'] as $existing) {
            if (($existing['status'] ?? '') === 'cancelada') continue;
            if (appointmentsOverlap($input, $existing, $data['services'] ?? [])) {
                return ['error' => 'Ese horario se empalma con otra cita activa. Selecciona otro horario.', 'code' => 'APPOINTMENT_UNAVAILABLE'];
            }
        }

        $input['id'] = bin2hex(random_bytes(16));
        $input['status'] = $createdByAdmin ? 'confirmada' : 'pendiente';
        array_unshift($data['appointments'], $input);
        return ['appointment' => $input];
    });
}

try {
    $action = $_GET['action'] ?? '';

    if ($action === 'ping') {
        getPdo();
        respond(200, ['status' => 'ok', 'time' => time(), 'database' => 'MySQL']);
        exit();
    }

    if ($action === 'admin_session') {
        respond(200, ['status' => 'ok', 'authenticated' => !empty($_SESSION['admin_authenticated'])]);
        exit();
    }

    $pdo = getPdo();
    if ($action === 'get_all') {
        $data = loadState($pdo);
        if (empty($_SESSION['admin_authenticated'])) {
            $data = publicState($data);
        }
        respond(200, ['status' => 'ok', 'data' => $data]);
        exit();
    }

    $adminActions = [
        'save_all', 'migrate_appointment_ids', 'save_admin_appointment', 'save_specialist', 'delete_specialist', 'save_specialists',
        'save_services', 'save_categories', 'save_schedule', 'save_booking_steps',
        'update_appointment_status', 'delete_appointment', 'delete_review',
        'update_business', 'change_admin_pin'
    ];
    if (in_array($action, $adminActions, true)) {
        requireAdminSession();
    }

    if ($action === 'save_all') {
        $input = readInput();
        if ($input === null) exit();
        updateState($pdo, function (&$data) use ($input) {
            $data = $input;
            return null;
        });
        respond(200, ['status' => 'ok', 'message' => 'Application data synchronized.']);
        exit();
    }

    if ($action === 'migrate_appointment_ids') {
        $result = updateState($pdo, function (&$data) {
            if (!isset($data['appointments']) || !is_array($data['appointments'])) {
                return ['data' => $data, 'migrated' => 0];
            }

            $usedIds = [];
            foreach ($data['appointments'] as $appointment) {
                if (isset($appointment['id'])) {
                    $usedIds[(string) $appointment['id']] = true;
                }
            }

            $migrated = 0;
            foreach ($data['appointments'] as &$appointment) {
                if (!isset($appointment['id']) || !preg_match('/^TR-/i', (string) $appointment['id'])) {
                    continue;
                }
                do {
                    $newId = bin2hex(random_bytes(16));
                } while (isset($usedIds[$newId]));

                unset($usedIds[(string) $appointment['id']]);
                $appointment['id'] = $newId;
                $usedIds[$newId] = true;
                $migrated++;
            }
            unset($appointment);

            return ['data' => $data, 'migrated' => $migrated];
        });
        respond(200, ['status' => 'ok', 'data' => $result['data'], 'migrated' => $result['migrated']]);
        exit();
    }

    $input = readInput();
    if ($input === null) exit();

    switch ($action) {
        case 'admin_login':
            if (!requireFields($input, ['pin'])) break;
            $now = time();
            $ipHash = getClientIpHash();
            $insertAttempt = $pdo->prepare(
                'INSERT IGNORE INTO admin_login_attempts (ip_hash, attempts, window_started, locked_until)
                 VALUES (:ip_hash, 0, UTC_TIMESTAMP(), NULL)'
            );
            $insertAttempt->execute(['ip_hash' => $ipHash]);
            $pdo->beginTransaction();
            $attemptRow = $pdo->prepare('SELECT attempts, window_started, locked_until FROM admin_login_attempts WHERE ip_hash = :ip_hash FOR UPDATE');
            $attemptRow->execute(['ip_hash' => $ipHash]);
            $attemptState = $attemptRow->fetch();
            if ($attemptState['locked_until'] && strtotime($attemptState['locked_until'] . ' UTC') > $now) {
                $pdo->commit();
                respond(429, ['status' => 'error', 'message' => 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.']);
                break;
            }
            if (strtotime($attemptState['window_started'] . ' UTC') < $now - 900) {
                $attemptState['attempts'] = 0;
                $attemptState['window_started'] = gmdate('Y-m-d H:i:s');
                $attemptState['locked_until'] = null;
            }
            $state = loadState($pdo);
            $storedPin = (string) ($state['business']['adminPin'] ?? '');
            $config = require __DIR__ . '/config.php';
            $configuredPin = $config['initial_admin_pin'];
            $configuredPinIsValid = isStrongAdminPin($configuredPin);
            $legacyDefaultPin = $storedPin !== '' && (
                password_verify('1234', $storedPin)
                || (!pinIsHashed($storedPin) && hash_equals('1234', $storedPin))
            );
            $configuredPinMatches = $configuredPinIsValid
                && hash_equals($configuredPin, (string) $input['pin']);
            if ($storedPin === '' && !$configuredPinMatches) {
                $pdo->commit();
                respond(403, ['status' => 'error', 'code' => 'PIN_SETUP_REQUIRED', 'message' => 'Configura TAROT_ADMIN_PIN con 6 dígitos en el servidor o usa la recuperación por correo.']);
                break;
            }
            $pinMatches = password_verify((string) $input['pin'], $storedPin)
                || (!pinIsHashed($storedPin) && $storedPin !== '' && hash_equals($storedPin, (string) $input['pin']))
                || (($legacyDefaultPin || $storedPin === '') && $configuredPinMatches);
            if (!$pinMatches) {
                $attempts = min(255, (int) $attemptState['attempts'] + 1);
                $lockedUntil = $attempts >= 5 ? gmdate('Y-m-d H:i:s', $now + 900) : null;
                $saveAttempts = $pdo->prepare(
                    'UPDATE admin_login_attempts SET attempts = :attempts, window_started = :window_started, locked_until = :locked_until WHERE ip_hash = :ip_hash'
                );
                $saveAttempts->execute([
                    'attempts' => $attempts,
                    'window_started' => $attemptState['window_started'],
                    'locked_until' => $lockedUntil,
                    'ip_hash' => $ipHash
                ]);
                $pdo->commit();
                respond(401, ['status' => 'error', 'message' => 'PIN incorrecto. Intenta de nuevo.']);
                break;
            }
            if (hash_equals('1234', (string) $input['pin'])) {
                if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
                    $pdo->commit();
                    respond(403, ['status' => 'error', 'code' => 'PIN_SETUP_REQUIRED', 'message' => 'El PIN antiguo está bloqueado desde conexiones remotas. Configura TAROT_ADMIN_PIN en el servidor o usa la recuperación por correo.']);
                    break;
                }
                $clearAttempts = $pdo->prepare('DELETE FROM admin_login_attempts WHERE ip_hash = :ip_hash');
                $clearAttempts->execute(['ip_hash' => $ipHash]);
                $pdo->commit();
                session_regenerate_id(true);
                $_SESSION['admin_setup_authorized'] = true;
                respond(428, ['status' => 'error', 'code' => 'PIN_CHANGE_REQUIRED', 'message' => 'El PIN predeterminado ya no está permitido. Define un PIN nuevo de 6 dígitos.']);
                break;
            }
            if ($configuredPinMatches && ($legacyDefaultPin || $storedPin === '')) {
                $newHash = password_hash($configuredPin, PASSWORD_DEFAULT);
                $state['business']['adminPin'] = $newHash;
                storeState($pdo, $state);
            } elseif (!pinIsHashed($storedPin)) {
                $newHash = password_hash((string) $input['pin'], PASSWORD_DEFAULT);
                $state['business']['adminPin'] = $newHash;
                storeState($pdo, $state);
            }
            $pdo->commit();
            $clearAttempts = $pdo->prepare('DELETE FROM admin_login_attempts WHERE ip_hash = :ip_hash');
            $clearAttempts->execute(['ip_hash' => $ipHash]);
            session_regenerate_id(true);
            $_SESSION['admin_authenticated'] = true;
            respond(200, ['status' => 'ok']);
            break;

        case 'setup_admin_pin':
            if (empty($_SESSION['admin_setup_authorized'])) {
                respond(401, ['status' => 'error', 'message' => 'Primero confirma el PIN predeterminado.']);
                break;
            }
            if (!requireFields($input, ['newPin'])) break;
            if (!isStrongAdminPin($input['newPin'])) {
                respond(400, ['status' => 'error', 'message' => 'El PIN debe tener 6 dígitos y no ser una secuencia o repetición simple.']);
                break;
            }
            $newHash = password_hash((string) $input['newPin'], PASSWORD_DEFAULT);
            updateState($pdo, function (&$data) use ($newHash) {
                $data['business']['adminPin'] = $newHash;
                return null;
            });
            unset($_SESSION['admin_setup_authorized']);
            session_regenerate_id(true);
            $_SESSION['admin_authenticated'] = true;
            $clearAttempts = $pdo->prepare('DELETE FROM admin_login_attempts WHERE ip_hash = :ip_hash');
            $clearAttempts->execute(['ip_hash' => getClientIpHash()]);
            respond(200, ['status' => 'ok']);
            break;

        case 'admin_logout':
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
            }
            session_destroy();
            respond(200, ['status' => 'ok']);
            break;

        case 'request_admin_recovery':
            $config = require __DIR__ . '/config.php';
            if (empty($config['smtp_username']) || empty($config['smtp_password'])) {
                respond(503, ['status' => 'error', 'message' => 'El envío todavía no está configurado. Agrega la cuenta Gmail y su contraseña de aplicación en TAROT_SMTP_USER y TAROT_SMTP_PASSWORD.']);
                break;
            }
            $statement = $pdo->query('SELECT requested_at FROM admin_recovery WHERE id = 1');
            $lastRequest = $statement->fetchColumn();
            if ($lastRequest && strtotime($lastRequest) > time() - 60) {
                respond(429, ['status' => 'error', 'message' => 'Espera un minuto antes de solicitar otro código.']);
                break;
            }
            $code = (string) random_int(100000, 999999);
            $insert = $pdo->prepare(
                'INSERT INTO admin_recovery (id, code_hash, expires_at, attempts, requested_at)
                 VALUES (1, :code_hash, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), 0, UTC_TIMESTAMP())
                 ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0, requested_at = VALUES(requested_at)'
            );
            $insert->execute(['code_hash' => password_hash($code, PASSWORD_DEFAULT)]);
            try {
                sendSmtpMessage(
                    $config,
                    $config['admin_email'],
                    'Código para recuperar el acceso administrativo',
                    "Tu código de recuperación es: {$code}\r\n\r\nVence en 10 minutos. Si no solicitaste este código, ignora este mensaje."
                );
            } catch (Throwable $error) {
                $pdo->exec('DELETE FROM admin_recovery WHERE id = 1');
                error_log('Tarot recovery email error: ' . $error->getMessage());
                respond(503, ['status' => 'error', 'message' => 'No se pudo enviar el correo. Revisa la conexión SMTP y la contraseña de aplicación de Gmail.']);
                break;
            }
            respond(200, ['status' => 'ok', 'message' => 'Enviamos un código al correo registrado.']);
            break;

        case 'complete_admin_recovery':
            if (!requireFields($input, ['code', 'newPin'])) break;
            if (!isStrongAdminPin($input['newPin'])) {
                respond(400, ['status' => 'error', 'message' => 'El PIN debe tener 6 dígitos y no ser una secuencia o repetición simple.']);
                break;
            }
            $pdo->beginTransaction();
            try {
                $recovery = $pdo->query('SELECT code_hash, expires_at, attempts FROM admin_recovery WHERE id = 1 FOR UPDATE')->fetch();
                if (!$recovery || strtotime($recovery['expires_at'] . ' UTC') < time() || $recovery['attempts'] >= 5) {
                    $pdo->exec('DELETE FROM admin_recovery WHERE id = 1');
                    $pdo->commit();
                    respond(400, ['status' => 'error', 'message' => 'El código venció o ya no es válido. Solicita uno nuevo.']);
                    break;
                }
                if (!password_verify((string) $input['code'], $recovery['code_hash'])) {
                    $updateAttempts = $pdo->prepare('UPDATE admin_recovery SET attempts = attempts + 1 WHERE id = 1');
                    $updateAttempts->execute();
                    $pdo->commit();
                    respond(400, ['status' => 'error', 'message' => 'El código ingresado no es correcto.']);
                    break;
                }
                $newPinHash = password_hash((string) $input['newPin'], PASSWORD_DEFAULT);
                $data = loadState($pdo, true);
                $data['business']['adminPin'] = $newPinHash;
                storeState($pdo, $data);
                $pdo->exec('DELETE FROM admin_recovery WHERE id = 1');
                $pdo->commit();
                session_regenerate_id(true);
                $_SESSION['admin_authenticated'] = true;
                $_SESSION['pin_attempts'] = 0;
                unset($_SESSION['pin_locked_until']);
                respond(200, ['status' => 'ok', 'message' => 'PIN actualizado correctamente.']);
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            break;

        case 'change_admin_pin':
            if (!requireFields($input, ['newPin'])) break;
            if (!isStrongAdminPin($input['newPin'])) {
                respond(400, ['status' => 'error', 'message' => 'El PIN debe tener 6 dígitos y no ser una secuencia o repetición simple.']);
                break;
            }
            $newPinHash = password_hash((string) $input['newPin'], PASSWORD_DEFAULT);
            updateState($pdo, function (&$data) use ($newPinHash) {
                $data['business']['adminPin'] = $newPinHash;
                return null;
            });
            respond(200, ['status' => 'ok']);
            break;

        case 'save_appointment':
            if (empty($input['startAt']) || empty($input['endAt'])) {
                requireAdminSession();
                if (!requireFields($input, ['specialistId', 'date', 'time', 'durationMins'])) break;
                $result = persistAppointment($pdo, $input, true);
                if (isset($result['error'])) {
                    respond(409, ['status' => 'error', 'code' => $result['code'], 'message' => $result['error']]);
                } else {
                    respond(200, ['status' => 'ok', 'appointment' => $result['appointment'], 'notified' => true]);
                }
                break;
            }
            if (!requireFields($input, ['specialistId', 'date', 'time', 'startAt', 'endAt', 'durationMins'])) break;
            $result = persistAppointment($pdo, $input);
            if (isset($result['error'])) {
                respond(409, ['status' => 'error', 'code' => $result['code'], 'message' => $result['error']]);
            } else {
                respond(200, ['status' => 'ok', 'appointment' => $result['appointment'], 'notified' => true]);
            }
            break;

        case 'save_admin_appointment':
            if (!requireFields($input, ['specialistId', 'date', 'time', 'durationMins'])) break;
            $result = persistAppointment($pdo, $input, true);
            if (isset($result['error'])) {
                respond(409, ['status' => 'error', 'code' => $result['code'], 'message' => $result['error']]);
            } else {
                respond(200, ['status' => 'ok', 'appointment' => $result['appointment'], 'notified' => true]);
            }
            break;

        case 'save_specialist':
            if (!requireFields($input, ['id'])) break;
            updateState($pdo, function (&$data) use ($input) {
                if (!isset($data['specialists'])) $data['specialists'] = [];
                $found = false;
                foreach ($data['specialists'] as &$specialist) {
                    if (($specialist['id'] ?? null) === $input['id']) {
                        $specialist = array_merge($specialist, $input);
                        $found = true;
                        break;
                    }
                }
                unset($specialist);
                if (!$found) $data['specialists'][] = $input;
                return null;
            });
            respond(200, ['status' => 'ok', 'specialist' => $input]);
            break;

        case 'delete_specialist':
            if (!requireFields($input, ['id'])) break;
            if ($input['id'] === 'any') {
                respond(400, ['status' => 'error', 'message' => 'The any specialist cannot be deleted.']);
                break;
            }
            $found = updateState($pdo, function (&$data) use ($input) {
                $specialists = $data['specialists'] ?? [];
                $found = count(array_filter($specialists, function ($specialist) use ($input) {
                    return ($specialist['id'] ?? null) === $input['id'];
                })) > 0;
                $data['specialists'] = array_values(array_filter($specialists, function ($specialist) use ($input) {
                    return ($specialist['id'] ?? null) !== $input['id'];
                }));
                return $found;
            });
            respond($found ? 200 : 404, $found
                ? ['status' => 'ok']
                : ['status' => 'error', 'message' => 'Specialist not found.']);
            break;

        case 'save_specialists':
        case 'save_services':
        case 'save_categories':
            $key = [
                'save_specialists' => 'specialists',
                'save_services' => 'services',
                'save_categories' => 'categories'
            ][$action];
            if (!array_is_list($input)) {
                respond(400, ['status' => 'error', 'message' => 'Expected a JSON array.']);
                break;
            }
            updateState($pdo, function (&$data) use ($key, $input) {
                $data[$key] = $input;
                return null;
            });
            respond(200, ['status' => 'ok', $key => $input]);
            break;

        case 'save_schedule':
            foreach (range(0, 6) as $dayNum) {
                $day = $input[(string) $dayNum] ?? null;
                if (!is_array($day)
                    || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $day['open'] ?? '')
                    || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $day['close'] ?? '')
                    || $day['open'] >= $day['close']) {
                    respond(400, ['status' => 'error', 'message' => 'Cada día debe tener un horario de apertura y cierre válido, y la apertura debe ser anterior al cierre.']);
                    break 2;
                }
                $lunchStart = $day['lunchStart'] ?? '';
                $lunchEnd = $day['lunchEnd'] ?? '';
                if (($lunchStart === '') !== ($lunchEnd === '')) {
                    respond(400, ['status' => 'error', 'message' => 'Completa el inicio y fin del horario de comida para cada día.']);
                    break 2;
                }
                if ($lunchStart !== ''
                    && (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $lunchStart)
                        || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $lunchEnd)
                        || $lunchStart >= $lunchEnd
                        || $lunchStart < $day['open']
                        || $lunchEnd > $day['close'])) {
                    respond(400, ['status' => 'error', 'message' => 'El horario de comida debe estar dentro del horario de atención y su inicio debe ser anterior al fin.']);
                    break 2;
                }
            }
            updateState($pdo, function (&$data) use ($input) {
                $data['schedule'] = $input;
                return null;
            });
            respond(200, ['status' => 'ok', 'schedule' => $input]);
            break;

        case 'save_booking_steps':
            if (!array_is_list($input)) {
                respond(400, ['status' => 'error', 'message' => 'Expected a JSON array.']);
                break;
            }
            foreach ($input as $step) {
                if (!is_array($step) || empty($step['title']) || empty($step['description'])) {
                    respond(400, ['status' => 'error', 'message' => 'Each booking step requires a title and description.']);
                    break 2;
                }
            }
            updateState($pdo, function (&$data) use ($input) {
                $data['bookingSteps'] = $input;
                return null;
            });
            respond(200, ['status' => 'ok', 'bookingSteps' => $input]);
            break;

        case 'update_appointment_status':
            if (!requireFields($input, ['id', 'status'])) break;
            if (!in_array($input['status'], ['confirmada', 'completada', 'pendiente', 'cancelada'], true)) {
                respond(400, ['status' => 'error', 'message' => 'Invalid appointment status.']);
                break;
            }
            $result = updateState($pdo, function (&$data) use ($input) {
                if (!isset($data['appointments'])) return false;
                foreach ($data['appointments'] as $index => $appointment) {
                    if (($appointment['id'] ?? null) === $input['id']) {
                        if ($input['status'] !== 'cancelada') {
                            foreach ($data['appointments'] as $other) {
                                if (($other['id'] ?? null) === $input['id'] || ($other['status'] ?? '') === 'cancelada') continue;
                                if (appointmentsOverlap($appointment, $other, $data['services'] ?? [])) {
                                    return ['error' => 'No se puede activar esta cita porque se empalma con otra cita activa.', 'code' => 'APPOINTMENT_UNAVAILABLE'];
                                }
                            }
                        }
                        $data['appointments'][$index]['status'] = $input['status'];
                        return true;
                    }
                }
                return false;
            });
            if (is_array($result) && isset($result['error'])) {
                respond(409, ['status' => 'error', 'code' => $result['code'], 'message' => $result['error']]);
            } else {
                respond($result ? 200 : 404, $result
                    ? ['status' => 'ok']
                    : ['status' => 'error', 'message' => 'Appointment not found.']);
            }
            break;

        case 'delete_appointment':
            if (!requireFields($input, ['id'])) break;
            $found = updateState($pdo, function (&$data) use ($input) {
                $appointments = $data['appointments'] ?? [];
                $found = count(array_filter($appointments, function ($appointment) use ($input) {
                    return ($appointment['id'] ?? null) === $input['id'];
                })) > 0;
                $data['appointments'] = array_values(array_filter($appointments, function ($appointment) use ($input) {
                    return ($appointment['id'] ?? null) !== $input['id'];
                }));
                return $found;
            });
            respond($found ? 200 : 404, $found
                ? ['status' => 'ok']
                : ['status' => 'error', 'message' => 'Appointment not found.']);
            break;

        case 'add_review':
            if (!requireFields($input, ['author'])) break;
            updateState($pdo, function (&$data) use ($input) {
                if (!isset($data['reviews'])) $data['reviews'] = [];
                array_unshift($data['reviews'], $input);
                return null;
            });
            respond(200, ['status' => 'ok', 'review' => $input]);
            break;

        case 'delete_review':
            if (!requireFields($input, ['id'])) break;
            $found = updateState($pdo, function (&$data) use ($input) {
                $reviews = $data['reviews'] ?? [];
                $found = count(array_filter($reviews, function ($review) use ($input) {
                    return ($review['id'] ?? null) === $input['id'];
                })) > 0;
                $data['reviews'] = array_values(array_filter($reviews, function ($review) use ($input) {
                    return ($review['id'] ?? null) !== $input['id'];
                }));
                return $found;
            });
            respond($found ? 200 : 404, $found
                ? ['status' => 'ok']
                : ['status' => 'error', 'message' => 'Review not found.']);
            break;

        case 'update_business':
            unset($input['adminPin']);
            updateState($pdo, function (&$data) use ($input) {
                $data['business'] = array_merge($data['business'] ?? [], $input);
                return null;
            });
            respond(200, ['status' => 'ok']);
            break;

        default:
            respond(400, ['status' => 'error', 'message' => 'Unknown API action.']);
    }
} catch (Throwable $error) {
    error_log('Tarot API error: ' . $error->getMessage());
    respond(503, ['status' => 'error', 'message' => 'The MySQL database is unavailable or could not process the request.']);
}
