import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from '@/components/ui/menubar'

type MenuItem = {
  id: string
  label: string
}

type MenuGroup = {
  label: string
  items: MenuItem[]
}

type AppMenuBarProps = {
  groups: MenuGroup[]
  onAction: (id: string) => void
}

const AppMenuBar = ({ groups, onAction }: AppMenuBarProps) => {
  return (
    <Menubar className="ml-2 hidden h-7 items-center gap-0.5 border-none bg-transparent p-0 shadow-none lg:flex">
      {groups.map((group) => (
        <MenubarMenu key={group.label}>
          <MenubarTrigger className="h-7 rounded-md px-2 text-xs font-normal text-muted-foreground hover:cursor-pointer data-[state=open]:text-foreground">
            {group.label}
          </MenubarTrigger>
          <MenubarContent align="start" className="min-w-40">
            {group.items.map((item) => (
              <MenubarItem key={item.id} onSelect={() => onAction(item.id)}>
                {item.label}
              </MenubarItem>
            ))}
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  )
}

export default AppMenuBar
