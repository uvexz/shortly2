/** Help screen: static guide with one-tap entry points to every feature. */

import { cb } from '../callback-data';
import type { BotContext, BotModule } from '../dispatch';
import { button, markup } from '../ui/keyboard';
import { BOT_NAME, TIME_ZONE_HINT, joinLines } from '../ui/texts';

function helpText(): string {
	return joinLines([
		`<b>❓ ${BOT_NAME} 使用帮助</b>`,
		'',
		'<b>🔗 短链接</b>',
		'• 新建短链：填写目标链接 → 选短链标识、域名、有效期、点击上限 → 创建',
		'• 我的短链：分页浏览全部短链，点开可复制、打开、查看点击/失效状态',
		'',
		'<b>✉️ 临时邮箱</b>',
		'• 新建邮箱：随机或自定义前缀 + 选择域名，一步创建',
		'• 我的邮箱：进入某个邮箱查看收件箱，支持标记已读、删除邮件、删除邮箱',
		'• 收到新邮件时 Shortly 会主动推送到这里，通知里自带操作按钮',
		'',
		'<b>🔑 账号</b>',
		'• 在 Shortly 后台创建 API Key，点「绑定 API Key」后把 Key 发给我即可',
		'• 后续可随时更换 Key 或解除本地绑定',
		'',
		`<i>除了目标链接、邮箱前缀、API Key 这类自由输入，其它操作都可以点按钮完成。${TIME_ZONE_HINT}。</i>`,
	]);
}

async function renderHelp(ctx: BotContext): Promise<void> {
	await ctx.render({
		text: helpText(),
		keyboard: markup([
			[button('➕ 新建短链', cb.linkNew), button('✉️ 新建邮箱', cb.mailNew)],
			[button('🔗 我的短链', cb.linkList(1)), button('📬 我的邮箱', cb.mailList(1))],
			[button('📊 我的账号', cb.acctShow), button('⚙️ 设置', cb.setShow)],
			[button('🏠 主页', cb.home)],
		]),
	});
}

export const helpModule: BotModule = {
	name: 'help',
	callbacks: {
		'help:show': renderHelp,
		'nav:help': renderHelp,
	},
	aliases: {
		help: renderHelp,
	},
};
