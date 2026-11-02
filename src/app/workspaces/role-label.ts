export type Role = 'admin' | 'member';

export function labelRole(role: Role): 'quản lý' | 'thành viên' {
  return role === 'admin' ? 'quản lý' : 'thành viên';
}
