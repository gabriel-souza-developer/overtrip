const SANDBOX_UID = 65_534;

export function sandboxArgs(trustedFiles: string[] = [], trustedDirs: string[] = []): string[] {
  const extraBind: string[] = [];
  const bound = new Set<string>();
  const bindPath = (target: string) => {
    if (target === '/usr' || target.startsWith('/usr/')) return;
    if (bound.has(target)) return;
    bound.add(target);
    extraBind.push('--ro-bind', target, target);
  };
  for (const file of trustedFiles) bindPath(file);
  for (const dir of trustedDirs) bindPath(dir);
  return [
    '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
    ...extraBind,
    '--proc', '/proc', '--dev', '/dev',
    // --unshare-all includes network (no DNS/sockets reachable, verified
    // manually), mount (its own private filesystem view — nothing outside
    // what is explicitly bound below is visible, let alone writable), pid
    // (its own reaper, see execute() above), ipc, uts and cgroup.
    '--unshare-all', '--die-with-parent', '--new-session',
    '--clearenv', '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'LANG', 'C.UTF-8',
    // No capability survives into the sandbox (verified manually:
    // CapInh/Prm/Eff/Bnd/Amb all read back as zero), and the process is
    // remapped away from the real uid even inside its own user namespace.
    '--cap-drop', 'ALL', '--uid', String(SANDBOX_UID), '--gid', String(SANDBOX_UID),
  ];
}
