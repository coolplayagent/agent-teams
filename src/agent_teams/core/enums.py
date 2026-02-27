from enum import Enum


class TaskStatus(str, Enum):
    CREATED = 'created'
    ASSIGNED = 'assigned'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    TIMEOUT = 'timeout'


class InstanceStatus(str, Enum):
    IDLE = 'idle'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    TIMEOUT = 'timeout'


class ScopeType(str, Enum):
    GLOBAL = 'global'
    SESSION = 'session'
    TASK = 'task'
    INSTANCE = 'instance'


class EventType(str, Enum):
    TASK_CREATED = 'task_created'
    TASK_ASSIGNED = 'task_assigned'
    TASK_STARTED = 'task_started'
    TASK_COMPLETED = 'task_completed'
    TASK_FAILED = 'task_failed'
    TASK_TIMEOUT = 'task_timeout'
    INSTANCE_CREATED = 'instance_created'
    INSTANCE_RECYCLED = 'instance_recycled'
    VERIFICATION_PASSED = 'verification_passed'
    VERIFICATION_FAILED = 'verification_failed'
